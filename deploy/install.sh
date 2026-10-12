#!/bin/bash
set -euo pipefail
state="$HOME/.local/state/company-safety-mcp-20261012"
target=/opt/company-safety-mcp
conf=/etc/nginx/sites-available/team-agent-hub
test ! -e "$target"
test ! -e /etc/systemd/system/company-safety-mcp.service
test ! -e /etc/company-safety-mcp
sudo -n cp "$conf" "$state/nginx-before.conf"
curl -fsSL --max-time 120 https://nodejs.org/dist/v24.16.0/node-v24.16.0-linux-x64.tar.xz -o "$state/node.tar.xz"
curl -fsSL --max-time 30 https://nodejs.org/dist/v24.16.0/SHASUMS256.txt -o "$state/SHASUMS256.txt"
expected=$(awk '$2=="node-v24.16.0-linux-x64.tar.xz" {print $1}' "$state/SHASUMS256.txt")
test -n "$expected"
echo "$expected  $state/node.tar.xz" | sha256sum -c -
sudo -n install -d -m 755 "$target/app" "$target/node"
sudo -n tar -xJf "$state/node.tar.xz" -C "$target/node" --strip-components=1 --no-same-owner
sudo -n tar -xzf "$state/app.tar.gz" -C "$target/app" --no-same-owner
sudo -n env PATH="$target/node/bin:/usr/bin:/bin" "$target/node/bin/npm" ci --omit=dev --ignore-scripts --prefix "$target/app"
sudo -n chmod -R a+rX "$target"
sudo -n install -d -m 700 /etc/company-safety-mcp
sudo -n install -m 600 "$state/tokens.json" /etc/company-safety-mcp/tokens.json
sudo -n install -m 644 "$target/app/deploy/service.unit" /etc/systemd/system/company-safety-mcp.service
rollback() {
  sudo -n cp "$state/nginx-before.conf" "$conf"
  sudo -n nginx -t && sudo -n systemctl reload nginx
  sudo -n systemctl disable --now company-safety-mcp || true
  echo 'Deployment failed; original site configuration restored'
}
trap rollback ERR
sudo -n systemctl daemon-reload
sudo -n systemctl enable --now company-safety-mcp
for i in $(seq 1 20); do
  status=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:4318/safety-mcp || true)
  if [ "$status" = 401 ]; then break; fi
  sleep 1
done
test "$status" = 401
sudo -n python3 - "$conf" <<'PY'
import pathlib,sys
p=pathlib.Path(sys.argv[1]);s=p.read_text()
anchor='    location / {\n        try_files $uri $uri/ =404;\n    }'
assert s.count(anchor)==1 and 'location = /safety-mcp' not in s
block='''    location = /safety-mcp {
        client_max_body_size 700k;
        client_body_buffer_size 768k;
        client_body_in_file_only off;
        proxy_request_buffering off;
        proxy_buffering off;
        proxy_max_temp_file_size 0;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header Authorization $http_authorization;
        proxy_set_header Connection "";
        proxy_read_timeout 30s;
        proxy_pass http://127.0.0.1:4318;
        access_log off;
        error_log /var/log/nginx/company-safety-mcp.error.log crit;
    }

'''
p.write_text(s.replace(anchor,block+anchor))
PY
sudo -n nginx -t
sudo -n systemctl reload nginx
for i in $(seq 1 10); do
  code=$(curl -s -o /dev/null -w '%{http_code}' https://tools.mapleai.top/safety-mcp)
  if [ "$code" = 401 ]; then break; fi
  sleep 1
done
test "$code" = 401
test "$(curl -s -o /dev/null -w '%{http_code}' https://tools.mapleai.top/)" = 200
trap - ERR
echo 'Service online; anonymous MCP denied; navigation website healthy'
