# movie-downloader
App to search and download movies from kinozal.tv (or any tracker) via WebUI or Telegram bot!

Steps to setup:

1. change X_UI_LINK env to you vless realty link from 3xui webui
2. set TELEGRAM_BOT_TOKEN env in movie-downloader
3. set ALLOWED_USERS to telegram user id (userinfobot)
4. `docker compose up -d --build`
6. go to IP:9117 and add kinozal indexer (with login/pass) and copy API KEY and paste it to docker-compose.yml to JACKETT_API_KEY
7. get password from qbittorrent logs, go to IP:8080 with this pass and change it. Now paste it to QB_PASS env in docker-compose.yml
8. `docker compose down` and `docker compose up -d --build`
9. Now you can go to IP:9339 search for movie, press download and it will appear soon in folder
