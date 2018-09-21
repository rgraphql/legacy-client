import { IRGQLValue, UnpackPrimitive } from 'rgraphql'
import { QueryTreeNode } from '../query-tree/query-tree-node'
import { ResultTreeHandler } from '../result-tree/result-tree-handler'
import util from 'util'

// JSONDecoderHandler is a cursor pointing to part of the result.
export class JSONDecoderHandler {
  // value is the current selected value position
  public value: any
  // qnode is the attached query tree node.
  public qnode: QueryTreeNode | undefined
  // pendingValue is a pending previous value
  public pendingValue: IRGQLValue | undefined

  // handleValue is a ResultTreeHandler.
  public handleValue(val: IRGQLValue): ResultTreeHandler {
    let nextHandler = new JSONDecoderHandler()
    let pendingValue = this.pendingValue

    // buildValueParent builds a new container value for the parent
    const buildValueParent = () => {
      if (val.arrayIndex) {
        return []
      } else if (val.queryNodeId) {
        return {}
      } else if (val.value) {
        return UnpackPrimitive(val.value)
      }
      return undefined
    }

    if (pendingValue) {
      // If the parent is a pending query_node selector
      if (pendingValue.queryNodeId) {
        if (!this.qnode) {
          return null
        }
        let childQn = this.qnode.lookupChildByID(pendingValue.queryNodeId)
        if (!childQn) {
          return null
        }

        let fieldName = childQn.getName()
        let pval: any
        if (!this.value.hasOwnProperty(fieldName)) {
          pval = buildValueParent()
          if (pval === undefined) {
            return null
          }
          this.value[fieldName] = pval
          if (val.value) {
            return null
          }
        } else {
          pval = this.value[fieldName]
        }

        nextHandler.value = pval
        nextHandler.pendingValue = val
        nextHandler.qnode = childQn
      } else if (pendingValue.arrayIndex) {
        let idx = (pendingValue.arrayIndex || 0) - 1
        // value is an array
        let nval = this.value[idx]
        if (nval === undefined) {
          nval = buildValueParent()
          if (nval === undefined) {
            return null
          }
          this.value[idx] = nval
          if (val.value) {
            return null
          }
        }
        nextHandler.value = nval
        nextHandler.pendingValue = val
        nextHandler.qnode = this.qnode
      } else {
        // unexpected, usually pendingValue has an arrayIndex or a queryNode
        return null
      }
    } else {
      if (val.arrayIndex || val.queryNodeId) {
        nextHandler.value = this.value
        nextHandler.pendingValue = val
        nextHandler.qnode = this.qnode
      } else {
        // Value without a query_node or array_idx selector
        // Can't process this.
        return null
      }
    }

    util.inspect(this)
    return nextHandler.handleValue.bind(nextHandler)
  }
}
