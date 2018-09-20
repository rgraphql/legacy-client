import { OperationDefinitionNode } from 'graphql'
import { CoercedVariableValues } from 'graphql/execution/values'

// Query is a query operation attached to a query tree.
export class Query {
  constructor(
    // queryID is a unique ID used to identify the query in the query tree.
    private queryID: number,
    // ast is the underlying ast for the query
    public ast: OperationDefinitionNode,
    // variables are any variables set on the query
    public variables: { [key: string]: any } | null
  ) {
    if (!variables) {
      this.variables = {}
    }
    if (ast.operation !== 'query') {
      throw new Error('unsupported operation: ' + ast.operation)
    }
  }

  // getQueryID returns the query id.
  public getQueryID(): number {
    return this.queryID
  }
}
