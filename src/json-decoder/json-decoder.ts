import { ResultTreeHandler } from '../result-tree/result-tree-handler'
import { QueryTree } from '../query-tree/query-tree'
import { Query } from '../query-tree/query'
import { QueryTreeNode } from '../query-tree/query-tree-node'
import { JSONDecoderHandler } from './json-decoder-handler'

// JSONDecoder is a result handler that decodes the query to JSON.
export class JSONDecoder {
  // result is the result object.
  private result: any = {}
  // qnode is the attached query tree node.
  private qnode: QueryTreeNode
  // query is the attached query.
  private query: Query

  // qnode_id -> array_idx => parent[qnode_field_name] = []
  // qnode_id -> array_idx -> primitive => parent[qnode_field_name][array_idx-1] = primitive

  // qnode_id -> primitive => parent[qnode_field_name] = primitive

  // qnode_id -> array_idx -> qnode_id = parent[qnode_field_name][array_idx-1] = {qnode_field_name: ?}
  // qnode_id goes to pending

  constructor(qt: QueryTree, query: Query) {
    this.qnode = qt.getRoot()
    this.query = query
  }

  // getResult returns the active result value.
  public getResult(): any {
    return this.result
  }

  // getResultHandler returns the result tree handler function.
  public getResultHandler(): ResultTreeHandler {
    let handler = new JSONDecoderHandler()
    handler.qnode = this.qnode
    handler.value = this.result
    return handler.handleValue.bind(handler)
  }
}
