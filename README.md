# Movie Downloader Deluxe

A comprehensive, containerized solution for searching and downloading media. This application combines Jackett for searching across multiple torrent trackers and qBittorrent for downloading, all managed through a clean web interface or a convenient Telegram bot.

The entire stack is orchestrated with Docker Compose, ensuring a simple and reproducible setup.

## Features

-   **Dual Interface**: Choose between a user-friendly Web UI or a responsive Telegram Bot.
-   **Powerful Search**: Leverages Jackett to search for content across hundreds of public and private trackers simultaneously.
-   **Efficient Downloading**: Integrates with qBittorrent, a reliable and feature-rich torrent client.
-   **Real-time Status**: View download progress and manage your queue from both the web and Telegram.
-   **Secure & Private**:
    -   Restrict Telegram bot access to a whitelist of user IDs.
    -   Optional VLESS proxy service to help Jackett access blocked trackers.
-   **Easy Setup**: Fully containerized with Docker and Docker Compose for a single-command launch.
-   **Responsive Design**: The web interface is designed to work on both desktop and mobile devices.

## Architecture

The system is composed of four main services that run in isolated Docker containers but communicate over a shared Docker network:

1.  **Movie Downloader (Node.js)**: The core application that serves the Web UI and runs the Telegram bot. It acts as the brain, sending search queries to Jackett and download commands to qBittorrent.
2.  **Jackett**: A proxy server for torrent trackers. It translates queries from the app into tracker-specific searches.
3.  **qBittorrent**: The torrent client that handles all downloading and seeding.
4.  **Proxy (Optional)**: A VLESS proxy service that Jackett can be configured to use, helping to bypass ISP blocks on certain torrent trackers.

```+----------------+      +-------------------------+      +-------------------+
|      User      |----->|   Movie Downloader App  |----->|    qBittorrent    |
+----------------+      | (Web UI / Telegram Bot) |      +-------------------+
                        +------------+------------+               |
                                     | (Search)                   | (Downloads)
                                     v                            v
                        +------------+------------+         +--------------+
                        |          Jackett        |<------->|   Internet   |
                        +-------------------------+         +--------------+
                                     ^
                                     | (Optional)
                                     v
                        +-------------------------+
                        |      VLESS Proxy        |
                        +-------------------------+
```

## Prerequisites

-   [Docker](https://docs.docker.com/get-docker/)
-   [Docker Compose](https://docs.docker.com/compose/install/)

## Installation & Setup

Follow these steps to get the application running.

**Step 1: Clone the Repository**

```bash
git clone https://github.com/dixon961/movie-downloader.git
cd movie-downloader
```

**Step 2: Initial Service Startup**

We need to run Jackett and qBittorrent once to generate their initial configuration files.

```bash
docker-compose up -d jackett qbittorrent
```

**Step 3: Configure qBittorrent**

1.  Open the qBittorrent Web UI by navigating to `http://localhost:8080`.
2.  Log in with the default credentials:
    -   **Username:** `admin`
    -   **Password:** `adminadmin`
3.  **IMPORTANT**: Go to `Tools -> Options -> Web UI` and change your password. Note this new password for the next step.

**Step 4: Configure Jackett**

1.  Open the Jackett Web UI by navigating to `http://localhost:9117`.
2.  Copy your **API Key**, which is displayed in the top right corner.
3.  Click `+ Add indexer` to add your preferred torrent trackers.
4.  (Optional) If you need to use the proxy, configure it in Jackett's settings (at the bottom of the page). The proxy is available to Jackett at `http://proxy:3128` (for HTTP) or `socks5://proxy:1080` (for SOCKS5).

**Step 5: Configure the Movie Downloader App**

Now, you need to provide the credentials and API keys to the main application.

1.  Open the `docker-compose.yml` file in a text editor.
2.  Locate the `movie-downloader` service section.
3.  Update the `environment` variables:
    -   `JACKETT_API_KEY`: Paste the API key you copied from Jackett.
    -   `QB_PASS`: Enter the **new** password you set for qBittorrent.
    -   `TELEGRAM_BOT_TOKEN`: Paste your Telegram bot token (get one from [@BotFather](https://t.me/botfather) on Telegram).
    -   `ALLOWED_USERS`: Enter a comma-separated list of numeric Telegram user IDs that should have access to the bot. You can get your ID from a bot like [@userinfobot](https://t.me/userinfobot).

**Step 6: Launch Everything**

Save your changes to `docker-compose.yml` and run the following command to start all services.

```bash
docker-compose up -d
```

The application is now running!

## How to Use

#### Web Interface

1.  Open your browser and go to `http://localhost:9339`.
2.  Use the search bar to find a movie or TV show.
3.  Click the `⬇️ Download` button next to a result to start the download.
4.  Expand the "Download Status" section and click `🔄 Update Status` to see the progress of your downloads in qBittorrent. You can also delete torrents and their data from this view.

#### Telegram Bot

1.  Find the bot you created on Telegram.
2.  Send the `/start` command to see the main menu.
3.  **Search**: Tap the `🔍 Search for Media` button. The bot will ask for your search query. Send the name of the media you're looking for.
4.  **Download**: The bot will return a list of results. Tap the result you want to download, and confirm your choice.
5.  **Check Status**: Tap the `📊 View Download Status` button to see the current queue and delete items if needed.
6.  **Cancel**: Send `/cancel` at any time to abort the current action (like a search) and return to the main menu.

## Environment Variables

These variables are used to configure the `movie-downloader` container.

| Variable               | Description                                                               | Default Value                  |
| ---------------------- | ------------------------------------------------------------------------- | ------------------------------ |
| `JACKETT_URL`          | The internal URL for the Jackett service.                                 | `http://jackett:9117`          |
| `JACKETT_API_KEY`      | **Required.** Your API key from the Jackett UI.                           | `QQQQQQQQQQQ`                  |
| `JACKETT_INDEXERS`     | Comma-separated list of indexer IDs to use, or `all`.                     | `all`                          |
| `QB_URL`               | The internal URL for the qBittorrent service.                             | `http://qbittorrent:8080`      |
| `QB_USER`              | The username for the qBittorrent Web UI.                                  | `admin`                        |
| `QB_PASS`              | **Required.** The password for the qBittorrent Web UI.                    | `CHANGE_PASSWORD`              |
| `TELEGRAM_BOT_TOKEN`   | **Required.** Your token from Telegram's BotFather.                       | `CHANGE_TELEGRAM_BOT_TOKEN`    |
| `ALLOWED_USERS`        | **Required.** Comma-separated list of numeric Telegram user IDs.          | `1111,2222,3333`               |
| `TZ`                   | The timezone for the application.                                         | `Europe/Amsterdam`             |
| `PORT`                 | The external port for the Web UI.                                         | `9339`                         |

## License

This project is licensed under the MIT License. See the `LICENSE` file for details.
