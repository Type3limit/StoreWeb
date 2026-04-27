#!/bin/bash
set -e

# ============================================================
# StoreWeb 一键部署脚本
# 适用: Ubuntu 18.04+
# 用法: sudo bash deploy.sh
# ============================================================

APP_DIR="/opt/storeweb"
APP_USER="www-data"
DOMAIN="${1:-_}"

echo "========================================"
echo "  StoreWeb 仓储管理系统 - 一键部署"
echo "========================================"
echo ""

# 检查 root
if [ "$(id -u)" -ne 0 ]; then
    echo "[ERR] 请使用 sudo 运行: sudo bash deploy.sh"
    exit 1
fi

# ---- 1. 安装系统依赖 ----
echo "[1/6] 安装系统依赖..."
apt-get update -qq
apt-get install -y -qq python3 python3-pip python3-venv nginx

# ---- 2. 创建应用目录 ----
echo "[2/6] 部署应用文件..."
mkdir -p "$APP_DIR"
cp -r "$(dirname "$0")"/* "$APP_DIR/"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

# ---- 3. 创建虚拟环境并安装依赖 ----
echo "[3/6] 安装 Python 依赖..."
cd "$APP_DIR"
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip -q
pip install -r requirements.txt -q
deactivate

# ---- 4. 创建 systemd 服务 ----
echo "[4/6] 配置 systemd 服务..."
cat > /etc/systemd/system/storeweb.service << 'SVC'
[Unit]
Description=StoreWeb - Warehouse Management
After=network.target

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/opt/storeweb
Environment="PATH=/opt/storeweb/venv/bin"
ExecStart=/opt/storeweb/venv/bin/gunicorn -w 2 -b 127.0.0.1:5000 app:app
ExecReload=/bin/kill -s HUP $MAINPID
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
SVC

# ---- 5. 配置 Nginx ----
echo "[5/6] 配置 Nginx..."
cat > /etc/nginx/sites-available/storeweb << 'NGX'
server {
    listen 80;
    server_name _;

    client_max_body_size 10m;
    gzip on;
    gzip_types text/css application/javascript text/html;

    location /static/ {
        alias /opt/storeweb/static/;
        expires 7d;
        add_header Cache-Control "public, immutable";
    }

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
NGX

# 启用站点
rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/storeweb /etc/nginx/sites-enabled/storeweb

# ---- 6. 启动服务 ----
echo "[6/6] 启动服务..."
systemctl daemon-reload
systemctl enable storeweb
systemctl restart storeweb
systemctl restart nginx

# ---- 防火墙提示 ----
echo ""
echo "========================================"
echo "  部署完成！"
echo "========================================"
echo ""
echo "  访问地址: http://<服务器IP>"
echo ""
echo "  管理命令:"
echo "    systemctl status storeweb   # 查看状态"
echo "    systemctl restart storeweb  # 重启"
echo "    journalctl -u storeweb -f   # 查看日志"
echo ""
echo "  如启用了 ufw 防火墙，请放行 80 端口:"
echo "    ufw allow 80/tcp"
echo ""
