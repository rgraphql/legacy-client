import { RunningQuery } from './query'
import { QueryTree } from '../query-tree/query-tree'
import { ResultTree } from '../result-tree/result-tree'
import { GraphQLSchema, OperationDefinitionNode, parse } from 'graphql'
import { Query } from '../query-tree/query'
import * as rgraphql from 'rgraphql'

// SoyuzClient implements the rgraphql client.
// It manages one or more query trees.
export class SoyuzClient {
  // queryTree is the client's primary query tree.
  private queryTree: QueryTree
  // resultTree is the primary result tree / cache
  private resultTree: ResultTree
  // queries is the list of running queries
  private queries: { [key: number]: RunningQuery } = {}
  // queryID is the query id
  private queryID = 1
  // resultID is the result tree id
  private resultID = 0

  constructor(
    public readonly schema: GraphQLSchema,
    private sendMsg: (msg: rgraphql.RGQLClientMessage) => void
  ) {
    this.queryTree = new QueryTree(schema, this.handleTreeMutation.bind(this))
    this.resultTree = new ResultTree(
      this.queryTree,
      rgraphql.RGQLValueInit_CacheStrategy.CACHE_LRU,
      100
    )
    sendMsg({ initQuery: { queryId: this.queryID } })
  }

  // buildQuery creates a new query.
  public buildQuery(
    ast: OperationDefinitionNode,
    variables?: { [key: string]: any } | null
  ): RunningQuery {
    const uquery = this.queryTree.buildQuery(ast, variables)
    const rq = new RunningQuery(uquery, this.resultTree, () => {
      this.disposeQuery(uquery)
    })
    this.queries[rq.getQuery().getQueryID()] = rq
    return rq
  }

  // parseQuery parses and builds a query.
  public parseQuery(source: string, variables?: { [key: string]: any } | null): RunningQuery {
    const defs = parse(source)
    let def: OperationDefinitionNode | undefined
    for (const defi of defs.definitions) {
      if (defi.kind === 'OperationDefinition' && defi.operation) {
        def = defi
      }
    }

    if (!def) {
      throw new Error('no query definition found in source')
    }

    return this.buildQuery(def, variables)
  }

  // getQueryTree returns the query tree.
  public getQueryTree(): QueryTree {
    return this.queryTree
  }

  // handleMessages handles a set of messages in bulk.
  public handleMessages(msgs: rgraphql.RGQLServerMessage[]) {
    for (const msg of msgs) {
      if (msg.valueInit) {
        if (msg.valueInit.queryId !== this.queryID) {
          continue
        }
        this.resultID = msg.valueInit.resultId || 0
      }
      if (msg.valueBatch && msg.valueBatch.resultId === this.resultID && msg.valueBatch.values) {
        for (const valueBin of msg.valueBatch.values) {
          const val = rgraphql.RGQLValue.decode(valueBin)
          this.resultTree.handleValue(val)
        }
      }
    }

    this.resultTree.flushHandlers()
  }

  // handleTreeMutation handles a query tree mutation.
  private handleTreeMutation(mut: rgraphql.RGQLQueryTreeMutation) {
    this.sendMsg({
      mutateTree: {
        queryId: this.queryID,
        nodeMutation: mut.nodeMutation,
        variables: mut.variables,
      },
    })
  }

  // disposeQuery disposes a query and detaches it from the tree.
  private disposeQuery(query: Query) {
    this.queryTree.detach(query)
    delete this.queries[query.getQueryID()]
  }

  // dispose cleans up all queries and disposes the query tree.
  public dispose() {
    this.sendMsg({ finishQuery: { queryId: this.queryID } })
  }
}
