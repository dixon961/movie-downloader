#!/bin/sh

echo "[*] Parsing VLESS link..."

URI="$X_UI_LINK"

echo "Environment 3X_UI_LINK is: $3X_UI_LINK"

UUID=$(echo "$URI" | sed -n 's|vless://\([^@]*\)@.*|\1|p')
HOST=$(echo "$URI" | sed -n 's|.*@\([^:]*\):.*|\1|p')
PORT=$(echo "$URI" | sed -n 's|.*:\([0-9]*\)?.*|\1|p')
PARAMS=$(echo "$URI" | cut -d'?' -f2)

TYPE=$(echo "$PARAMS" | tr '&' '\n' | grep '^type=' | cut -d= -f2)
SECURITY=$(echo "$PARAMS" | tr '&' '\n' | grep '^security=' | cut -d= -f2)
PBK=$(echo "$PARAMS" | tr '&' '\n' | grep '^pbk=' | cut -d= -f2)
FP=$(echo "$PARAMS" | tr '&' '\n' | grep '^fp=' | cut -d= -f2)
SNI=$(echo "$PARAMS" | tr '&' '\n' | grep '^sni=' | cut -d= -f2)
SID=$(echo "$PARAMS" | tr '&' '\n' | grep '^sid=' | cut -d= -f2)
SPX=$(echo "$PARAMS" | tr '&' '\n' | grep '^spx=' | cut -d= -f2 | sed 's/%2F/\//g')
FLOW=$(echo "$PARAMS" | tr '&' '\n' | grep '^flow=' | cut -d= -f2)

echo "[*] Parsed:"
echo "  UUID=$UUID"
echo "  HOST=$HOST"
echo "  PORT=$PORT"
echo "  TYPE=$TYPE"
echo "  SECURITY=$SECURITY"
echo "  FLOW=$FLOW"

echo "[*] Generating config..."

STREAM_SETTINGS="\"network\": \"$TYPE\""

if [ "$SECURITY" = "reality" ]; then
  STREAM_SETTINGS="$STREAM_SETTINGS,
    \"security\": \"reality\",
    \"realitySettings\": {
      \"show\": false,
      \"serverName\": \"$SNI\",
      \"publicKey\": \"$PBK\",
      \"shortId\": \"$SID\",
      \"spiderX\": \"$SPX\"
    },
    \"tcpSettings\": {
      \"header\": {
        \"type\": \"none\"
      }
    }"
elif [ "$SECURITY" = "tls" ]; then
  STREAM_SETTINGS="$STREAM_SETTINGS,
    \"security\": \"tls\",
    \"tlsSettings\": {},
    \"wsSettings\": {
      \"path\": \"$SPX\"
    }"
fi

cat > /etc/xray/config.json <<EOF
{
  "log": {
    "loglevel": "warning"
  },
  "inbounds": [
    {
      "port": 1080,
      "listen": "0.0.0.0",
      "protocol": "socks",
      "settings": {}
    },
    {
      "port": 3128,
      "listen": "0.0.0.0",
      "protocol": "http",
      "settings": {}
    }
  ],
  "outbounds": [
    {
      "protocol": "vless",
      "tag": "proxy",
      "settings": {
        "vnext": [
          {
            "address": "$HOST",
            "port": $PORT,
            "users": [
              {
                "id": "$UUID",
                "encryption": "none",
                "flow": "$FLOW"
              }
            ]
          }
        ]
      },
      "streamSettings": {
        $STREAM_SETTINGS
      }
    },
    {
        "protocol": "freedom",
        "tag": "direct"
    }
  ],
  "routing": {
        "domainStrategy": "IPIfNonMatch",
        "rules": [
            {
                "type": "field",
                "ip": [
                    "127.0.0.0/8",
                    "10.0.0.0/8",
                    "172.16.0.0/12",
                    "192.168.0.0/16",
                    "169.254.0.0/16",
                    "::1/128",
                    "fc00::/7",
                    "fe80::/10"
                ],
                "outboundTag": "direct"
            },
            {
              "type": "field",
              "ip": ["0.0.0.0/0", "::/0"],
              "outboundTag": "proxy"
            }
        ]
    }
}
EOF

echo "[*] Starting Xray..."
exec xray run -config /etc/xray/config.json
