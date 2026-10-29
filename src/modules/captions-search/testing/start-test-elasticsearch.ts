import { GenericContainer, Wait } from "testcontainers";
import { publishTestElasticsearch } from "./test-elasticsearch.js";

const PORT = 9200;

/**
 * Starts the container and returns how to stop it. It isn't reused across
 * runs: searches and writes go to the `captions` alias, so two runs sharing a
 * container would overwrite each other's index.
 */
export async function startTestElasticsearch(): Promise<() => Promise<void>> {
  const container = await new GenericContainer(
    "docker.elastic.co/elasticsearch/elasticsearch:8.12.0",
  )
    .withEnvironment({
      "discovery.type": "single-node",
      "xpack.security.enabled": "false",
      ES_JAVA_OPTS: "-Xms512m -Xmx512m",
      // Otherwise a nearly full disk on the host makes the index read-only.
      "cluster.routing.allocation.disk.threshold_enabled": "false",
    })
    .withExposedPorts(PORT)
    .withWaitStrategy(Wait.forHttp("/_cluster/health", PORT).forStatusCode(200))
    .withStartupTimeout(120_000)
    .start();

  publishTestElasticsearch(
    `http://${container.getHost()}:${container.getMappedPort(PORT)}`,
  );
  return async () => {
    await container.stop();
  };
}
