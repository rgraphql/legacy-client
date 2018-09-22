import { rgraphql, UnpackPrimitive } from 'rgraphql'
import { QueryTreeNode } from '../query-tree/query-tree-node'
import { ResultTreeHandler } from '../result-tree/result-tree-handler'

// JSONDecoderHandler is a cursor pointing to part of the result.
export class JSONDecoderHandler {
  // value is the current selected value position
  public value: any
  // qnode is the attached query tree node.
  public qnode?: QueryTreeNode

  // applyValue applies at the previously selected position
  public applyValue?: (override: boolean, getVal: () => any) => any
  // pendingValue is a pending previous value
  public pendingValue?: rgraphql.IRGQLValue

  constructor(private valChangedCb: () => void) {}

  // handleValue is a ResultTreeHandler.
  public handleValue(val: rgraphql.IRGQLValue): ResultTreeHandler {
    let nextHandler = new JSONDecoderHandler(this.valChangedCb)
    let pendingValue = this.pendingValue

    if (val.queryNodeId) {
      if (!this.qnode) {
        return null
      }

      let childQnode = this.qnode.lookupChildByID(val.queryNodeId || 0)
      if (!childQnode) {
        return null
      }
      let childFieldName = childQnode.getName()

      let nval: any
      if (this.applyValue) {
        nval = this.applyValue(false, () => {
          return {}
        })
      } else {
        nval = this.value
      }

      nextHandler.applyValue = (override: boolean, getVal: () => any) => {
        if (override || !this.value.hasOwnProperty(childFieldName)) {
          let nxval = getVal()
          nval[childFieldName] = nxval
          if (this.valChangedCb) {
            this.valChangedCb()
          }
          return nxval
        }
        return nval[childFieldName]
      }
      nextHandler.value = nval
      nextHandler.qnode = childQnode
    } else if (val.arrayIndex) {
      let nval: any[]
      if (this.applyValue) {
        nval = this.applyValue(false, () => {
          return []
        })
      } else {
        nval = this.value
      }

      let idx = (val.arrayIndex || 1) - 1
      nextHandler.qnode = this.qnode
      nextHandler.applyValue = (override: boolean, getVal: () => any) => {
        if (override || nval[idx] === undefined) {
          let nxval = getVal()
          nval[idx] = nxval
          if (this.valChangedCb) {
            this.valChangedCb()
          }
          return nxval
        }
        return nval[idx]
      }
    } else {
      nextHandler = this
    }

    if (val.value) {
      if (nextHandler.applyValue) {
        let unpacked = UnpackPrimitive(val.value)
        nextHandler.applyValue(true, () => {
          return unpacked
        })
      } else {
        // cannot process w/o applyValue function
        return null
      }
    }

    return nextHandler.handleValue.bind(nextHandler)
  }
}
