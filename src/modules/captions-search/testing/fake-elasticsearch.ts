import type { Client } from "@elastic/elasticsearch";

type Document = Record<string, unknown>;

type AliasAction =
  | { add: { index: string; alias: string } }
  | { remove: { index: string; alias: string } }
  | { remove_index: { index: string } };

type BulkOperation = { index: { _id: string } } | Document;

type IndexDefinition = { settings?: object; mappings?: object };

/**
 * An in-memory stand-in for the part of Elasticsearch the search index uses:
 * indices holding documents by id, and aliases naming one index each.
 */
export class FakeElasticsearch {
  private readonly indices = new Map<string, Map<string, Document>>();
  private readonly aliases = new Map<string, string>();
  private readonly definitions = new Map<string, IndexDefinition>();
  private failingWrites = false;
  private failingDeletes = false;
  private failingAliasUpdates = false;

  /** Runs before each bulk write lands, as if it happened during that write. */
  beforeEachWrite: () => Promise<void> = async () => {};

  readonly client = {
    indices: {
      create: async ({
        index,
        settings,
        mappings,
      }: {
        index: string;
        settings?: object;
        mappings?: object;
      }) => {
        if (this.indices.has(index) || this.aliases.has(index)) {
          throw new Error(`resource_already_exists_exception: ${index}`);
        }
        this.indices.set(index, new Map());
        this.definitions.set(index, { settings, mappings });
        return { acknowledged: true, index };
      },
      delete: async ({ index }: { index: string }) => {
        this.concrete(index);
        if (this.failingDeletes) {
          throw new Error(`process_cluster_event_timeout_exception: ${index}`);
        }
        this.indices.delete(index);
        this.dropAliasesOf(index);
        return { acknowledged: true };
      },
      refresh: async ({ index }: { index: string }) => {
        this.concrete(this.resolve(index));
        return {};
      },
      getAlias: async ({ index }: { index: string }) => {
        const response: Record<string, { aliases: Record<string, object> }> =
          {};
        for (const name of this.indices.keys()) {
          if (matches(name, index)) {
            response[name] = { aliases: {} };
          }
        }
        for (const [alias, name] of this.aliases) {
          if (matches(name, index) || matches(alias, index)) {
            response[name] ??= { aliases: {} };
            response[name].aliases[alias] = {};
          }
        }
        return response;
      },
      updateAliases: async ({ actions }: { actions: AliasAction[] }) => {
        if (this.failingAliasUpdates) {
          throw new Error("process_cluster_event_timeout_exception");
        }
        const indices = new Map(this.indices);
        const aliases = new Map(this.aliases);
        for (const action of actions) {
          if ("remove_index" in action) {
            const { index } = action.remove_index;
            if (!indices.delete(index)) {
              throw new Error(`index_not_found_exception: ${index}`);
            }
            for (const [alias, target] of aliases) {
              if (target === index) aliases.delete(alias);
            }
          }
          if ("remove" in action) {
            const { index, alias } = action.remove;
            if (aliases.get(alias) !== index) {
              throw new Error(`aliases_not_found_exception: ${alias}`);
            }
            aliases.delete(alias);
          }
        }
        for (const action of actions) {
          if ("add" in action) {
            const { index, alias } = action.add;
            if (!indices.has(index)) {
              throw new Error(`index_not_found_exception: ${index}`);
            }
            if (indices.has(alias)) {
              throw new Error(
                `invalid_alias_name_exception: an index exists with the same name as the alias [${alias}]`,
              );
            }
            aliases.set(alias, index);
          }
        }
        this.replaceWith(indices, aliases);
        return { acknowledged: true };
      },
    },
    bulk: async ({
      index,
      operations,
    }: {
      index: string;
      operations: BulkOperation[];
    }) => {
      await this.beforeEachWrite();
      const documents = this.concrete(this.resolve(index));
      const writes = [];
      for (let i = 0; i < operations.length; i += 2) {
        const action = operations[i] as { index: { _id: string } };
        writes.push({ id: action.index._id, document: operations[i + 1] });
      }
      if (this.failingWrites) {
        return {
          errors: true,
          items: writes.map(({ id }) => ({
            index: {
              _id: id,
              status: 429,
              error: { type: "es_rejected_execution_exception" },
            },
          })),
        };
      }
      for (const { id, document } of writes) {
        documents.set(id, document as Document);
      }
      return { errors: false, items: [] };
    },
    count: async ({ index }: { index: string }) => ({
      count: this.concrete(this.resolve(index)).size,
    }),
  };

  asClient(): Client {
    return this.client as unknown as Client;
  }

  createIndex(name: string, documents: Document[] = []): void {
    this.indices.set(
      name,
      new Map(documents.map((document) => [String(document.id), document])),
    );
  }

  failWrites(): void {
    this.failingWrites = true;
  }

  acceptWrites(): void {
    this.failingWrites = false;
  }

  failDeletes(): void {
    this.failingDeletes = true;
  }

  failAliasUpdates(): void {
    this.failingAliasUpdates = true;
  }

  indexNames(): string[] {
    return [...this.indices.keys()].sort();
  }

  /** The index an alias points at, or undefined when it isn't an alias. */
  aliasTarget(alias: string): string | undefined {
    return this.aliases.get(alias);
  }

  /** The settings and mappings an index was created with. */
  createdWith(index: string): IndexDefinition | undefined {
    return this.definitions.get(index);
  }

  /** The documents an index or alias holds, by id. */
  documents(name: string): Document[] {
    return [...this.concrete(this.resolve(name)).values()].sort((a, b) =>
      String(a.id).localeCompare(String(b.id)),
    );
  }

  private resolve(name: string): string {
    return this.aliases.get(name) ?? name;
  }

  private concrete(name: string): Map<string, Document> {
    const documents = this.indices.get(name);
    if (!documents) {
      throw new Error(`index_not_found_exception: ${name}`);
    }
    return documents;
  }

  private dropAliasesOf(index: string): void {
    for (const [alias, target] of this.aliases) {
      if (target === index) this.aliases.delete(alias);
    }
  }

  private replaceWith(
    indices: Map<string, Map<string, Document>>,
    aliases: Map<string, string>,
  ): void {
    this.indices.clear();
    for (const [name, documents] of indices) this.indices.set(name, documents);
    this.aliases.clear();
    for (const [alias, index] of aliases) this.aliases.set(alias, index);
  }
}

function matches(name: string, pattern: string): boolean {
  return pattern.endsWith("*")
    ? name.startsWith(pattern.slice(0, -1))
    : name === pattern;
}
