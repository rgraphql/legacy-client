import { OperationDefinitionNode, visit, GraphQLSchema, FieldNode, BREAK } from 'graphql'
import { QueryTreeHandler } from './query-tree-handler'
import { QueryTreeNode } from './query-tree-node'
import { VariableStore } from '../var-store'
import { rgraphql } from 'rgraphql'
import { Query } from './query'
import { AttachedQuery } from './query-attached'
import { getLookupType } from '../util'

// QueryTree manages merging Query fragments into a single query tree.
export class QueryTree {
  // nextID is the next query node id
  private nextID = 1
  // nextQueryID is the next query ID
  private nextQueryID = 1
  // attachedQueries contains information about each attached query.
  private attachedQueries: { [queryID: number]: AttachedQuery } = {}
  // root is the root of the query tree
  private root: QueryTreeNode
  // varStore is the variable store
  private varStore: VariableStore
  // pendingVariables contains the set of new variables to xmit
  private pendingVariables: rgraphql.IASTVariable[] = []

  constructor(
    // schema is the graphql schema
    private schema: GraphQLSchema,
    // handler handles changes to the tree.
    private handler?: QueryTreeHandler
  ) {
    let queryType = schema.getQueryType()
    if (!queryType) {
      throw new Error('schema has no query type definedj')
    }

    this.varStore = new VariableStore()
    this.root = new QueryTreeNode(0, '', queryType, this.varStore)
  }

  // getGraphQLSchema returns the graphQL schema.
  public getGraphQLSchema(): GraphQLSchema {
    return this.schema as GraphQLSchema
  }

  // getRoot returns the root node.
  public getRoot(): QueryTreeNode {
    return this.root
  }

  // buildQuery creates a new query attached to the query tree.
  public buildQuery(
    ast: OperationDefinitionNode,
    variables?: { [key: string]: any } | null
  ): Query {
    let nqid = this.nextQueryID
    this.nextQueryID++
    let query = new Query(nqid, ast, variables || null)
    this.attach(query)
    return query
  }

  // attach attaches a query to the query tree.
  public attach(query: Query) {
    if (this.attachedQueries.hasOwnProperty(query.getQueryID())) {
      return
    }

    let qtree = this
    let lookupType = getLookupType(this.schema)
    let varStore = this.varStore
    let qnode: QueryTreeNode = this.root
    let validateErr: Error | null = null
    let attachedQuery = new AttachedQuery(query)
    let newNodes: QueryTreeNode[] = []
    let newNodeDepth = 0

    visit(query.ast, {
      Field: {
        enter(node: FieldNode) {
          // enter the field node
          if (!node.name || !node.name.value || !node.name.value.length) {
            return false
          }

          let childNode: QueryTreeNode | null = null
          try {
            childNode = qnode.resolveChild(node, lookupType, () => {
              let nodeID = qtree.nextID
              qtree.nextID++
              return new QueryTreeNode(nodeID, '', null, varStore)
            })
          } catch (e) {
            validateErr = e
            return BREAK
          }

          // TODO: verify this
          if (!childNode) {
            return BREAK
          }

          if (childNode.getRefCount() === 0 && newNodeDepth === 0) {
            newNodes.push(childNode)
            newNodeDepth++
          } else if (newNodeDepth) {
            newNodeDepth++
          }

          childNode.incRefCount()
          attachedQuery.appendQueryNode(childNode)
          qnode = childNode
          return
        },
        leave(node: FieldNode) {
          // leave the field node
          if (!node.name || !node.name.value || !node.name.value.length) {
            return false
          }

          if (newNodeDepth) {
            newNodeDepth--
          }

          let parent = qnode.getParent()
          if (!parent) {
            throw new Error('expected parent but found none')
          }
          qnode = parent
          return false
        }
      }
    })

    if (validateErr) {
      // purge nodes
      for (let qn of attachedQuery.qtNodes) {
        if (qn.decRefCount() === 0) {
          qn.flagGcNext()
        }
      }
      this.gcSweep()
      this.pendingVariables = []
      throw validateErr
    }

    if (newNodes.length && this.handler) {
      let nodeMutation: rgraphql.RGQLQueryTreeMutation.INodeMutation[] = []
      for (let n of newNodes) {
        n.markXmitted()
        let parent = n.getParent()
        if (!parent) {
          continue
        }
        nodeMutation.push({
          nodeId: parent.getID(),
          node: n.buildProto(),
          operation: rgraphql.RGQLQueryTreeMutation.SubtreeOperation.SUBTREE_ADD_CHILD
        })
      }

      // TODO: set query ID?
      this.handler({
        nodeMutation,
        variables: this.pendingVariables
      })
    }

    this.pendingVariables = []
    this.attachedQueries[query.getQueryID()] = attachedQuery
    this.gcSweep()
  }

  // detach detaches a query from the tree.
  public detach(query: Query) {
    let attachedQuery = this.attachedQueries[query.getQueryID()]
    if (!attachedQuery) {
      return
    }

    let gcSweep = false
    for (let nod of attachedQuery.qtNodes) {
      if (nod.decRefCount() === 0) {
        gcSweep = true
        nod.flagGcNext()
      }
    }
    delete this.attachedQueries[query.getQueryID()]

    if (gcSweep) {
      this.gcSweep()
    }
  }

  // buildProto transforms the entire query tree to protobuf format
  public buildProto(): rgraphql.IRGQLQueryTreeNode {
    return this.root.buildProto()
  }

  // gcSweep performs a garbage collection sweep.
  public gcSweep() {
    let allUnrefNodes: QueryTreeNode[] = []
    this.root.gcSweep((unrefNodes: QueryTreeNode[]) => {
      if (!unrefNodes || !unrefNodes.length) {
        return
      }
      allUnrefNodes = allUnrefNodes.concat(unrefNodes)
    })
    if (allUnrefNodes.length && this.handler) {
      let muts: rgraphql.RGQLQueryTreeMutation.INodeMutation[] = []
      for (let n of allUnrefNodes) {
        muts.push({
          nodeId: n.getID(),
          operation: rgraphql.RGQLQueryTreeMutation.SubtreeOperation.SUBTREE_DELETE
        })
      }
      // TODO: set query id
      this.handler({
        nodeMutation: muts
      })
    }
  }
}
