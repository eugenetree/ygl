import { AxiosHeaders } from "axios";

export enum FetchErrorType {
  HTTP = "http",
  NETWORK = "network",
  UNKNOWN = "unknown",
}

type ConstructorParams =
  | {
      type: FetchErrorType.HTTP;
      status: number;
      statusText: string;
      headers: Partial<AxiosHeaders>;
      data: unknown;
    }
  | {
      type: FetchErrorType.NETWORK;
      cause: unknown;
    }
  | {
      type: FetchErrorType.UNKNOWN;
      cause: unknown;
    };

export type FetchError = {
  type: "FETCH_ERROR";
  kind: "HTTP";
  status: number;
  statusText: string;
  data: unknown;
} | {
  type: "FETCH_ERROR";
  kind: "NETWORK";
  cause: unknown;
} | {
  type: "FETCH_ERROR";
  kind: "UNKNOWN";
  cause: unknown;
}

// export class FetchError extends Error {
//   public readonly name = FetchError.name;

//   constructor(params: ConstructorParams) {
//     switch (params.type) {
//       case FetchErrorType.HTTP:
//         super(
//           `Http fetch error ${params.status}: ` +
//             `\n${JSON.stringify(params?.data, null, 2)}`,
//         );
//         break;
//       case FetchErrorType.NETWORK:
//         super(`Network fetch error`, { cause: params.cause });
//         break;
//       case FetchErrorType.UNKNOWN:
//         super(`Unknown fetch error`, { cause: params.cause });
//     }
//   }
// }
