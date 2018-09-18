import { GraphQLSchema } from 'graphql'
import { QueryTreeHandler } from './query-tree-handler'

// QueryTree manages merging Query fragments into a single query tree.
export class QueryTree {
  // nextID is the next query node id
  private nextID = 1
  private attachedQueries: { [key: string]: string } = {}

  constructor(private schema: GraphQLSchema, private changeHandler: QueryTreeHandler) {}
}
