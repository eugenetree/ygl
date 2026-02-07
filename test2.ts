import "reflect-metadata";

import { Container } from "inversify";

import { HttpClient } from "./src/modules/_common/http/index.js";
import { Logger } from "./src/modules/_common/logger/logger.js";

const container = new Container({ autobind: true });

container.bind(Logger).toDynamicValue(() => {
  return new Logger({ context: "Test", category: "test2" });
});

container.bind(HttpClient).toDynamicValue(() => {
  return new HttpClient(container.get(Logger), {
    requestCooldown: 2000,
  });
});
//   .inSingletonScope();

const refs: (HttpClient | number)[] = [0, 1, 2, 3];

class Test {
  private readonly number: number;
  constructor(
    private readonly httpClient: HttpClient,
    number: number,
  ) {
    this.number = number;
  }

  async run() {
    refs[this.number] = this.httpClient;
    return this.httpClient.get("https://www.google.com");
  }
}

const main = async () => {
  const test1 = new Test(container.get(HttpClient), 1);
  test1.run().then((e) => console.log(e));
  const test2 = new Test(container.get(HttpClient), 2);
  test2.run().then((e) => console.log(e));
  const test3 = new Test(container.get(HttpClient), 3);
  test3.run().then((e) => console.log(e));
};

main();

console.log(refs[1] === refs[2] && refs[2] === refs[3]);
