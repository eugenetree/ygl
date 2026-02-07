# Simple Elasticsearch Example

This directory contains a simple Elasticsearch setup using Docker Compose. It's configured to ingest data from the `captions.json` file located in the parent directory.

## Prerequisites

- Docker
- Node.js and npm

## How to run

1.  **Start Elasticsearch and Kibana:**

    ```bash
    docker-compose up -d
    ```

    - Elasticsearch will be available at `http://localhost:9200`.
    - Kibana will be available at `http://localhost:5601`.

2.  **Install dependencies for the ingestion script:**

    Navigate to this directory (`elastic-simple`) in your terminal and run:

    ```bash
    npm install
    ```

3.  **Run the ingestion script:**

    ```bash
    npm start
    ```

    This will:

    - Connect to your local Elasticsearch instance.
    - Create an index named `captions`.
    - Ingest all the data from `../captions.json` into the `captions` index.

## Exploring the data

You can use Kibana to explore the data.

1.  Open Kibana in your browser: `http://localhost:5601`.
2.  Go to the "Dev Tools" section (wrench icon in the sidebar).
3.  You can run search queries here. For example, to search for "some text":

    ```json
    GET /captions/_search
    {
      "query": {
        "match": {
          "text": "some text"
        }
      }
    }
    ```

## Stopping the services

To stop the Elasticsearch and Kibana containers, run:

```bash
docker-compose down
```
