import { rgraphql, UnpackPrimitive } from 'rgraphql'
import { QueryTreeNode } from '../query-tree/query-tree-node'
import { ResultTreeHandler } from '../result-tree/result-tree-handler'
import { SelectionSetNode, visit, SelectionNode, FieldNode, BREAK } from 'graphql'

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

  constructor(private queryAST: SelectionSetNode | undefined, private valChangedCb: () => void) {}

  // handleValue is a ResultTreeHandler.
  public handleValue(val: rgraphql.IRGQLValue | undefined): ResultTreeHandler {
    let nextHandler = new JSONDecoderHandler(this.queryAST, this.valChangedCb)
    let pendingValue = this.pendingValue

    if (val === undefined) {
      if (this.applyValue) {
        this.applyValue(true, () => {
          return undefined
        })
      }
      return null
    }

    if (val.queryNodeId) {
      if (!this.qnode) {
        return null
      }

      let childQnode = this.qnode.lookupChildByID(val.queryNodeId || 0)
      if (!childQnode) {
        return null
      }
      let childFieldName = childQnode.getName()
      let childResultFieldName = childFieldName

      let childAST: SelectionSetNode | undefined
      if (this.queryAST) {
        visit(this.queryAST, {
          Field: {
            enter(node: FieldNode) {
              if (node.name && node.name.value === childFieldName) {
                if (node.alias && node.alias.value) {
                  childResultFieldName = node.alias.value
                }
                childAST = node.selectionSet
                return BREAK
              }

              return false // no need to traverse further
            }
          }
        })
      }

      let nval: any
      if (this.applyValue) {
        nval = this.applyValue(false, () => {
          return {}
        })
      } else {
        nval = this.value
      }

      nextHandler.queryAST = childAST
      nextHandler.applyValue = (override: boolean, getVal: () => any) => {
        if (override || !this.value.hasOwnProperty(childResultFieldName)) {
          let nxval = getVal()
          if (nxval === undefined) {
            delete nval[childResultFieldName]
          } else {
            nval[childResultFieldName] = nxval
          }
          if (this.valChangedCb) {
            this.valChangedCb()
          }
          return nxval
        }
        return nval[childResultFieldName]
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
          if (nxval === undefined) {
            // TODO: investigate if this index is consistent.
            nval.splice(idx, 1)
          } else {
            nval[idx] = nxval
          }
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
