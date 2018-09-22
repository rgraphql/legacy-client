import { ResultTree } from '../result-tree/result-tree'
import { JSONDecoder } from './json-decoder'
import { QueryTree } from '../query-tree/query-tree'
import { parse, buildSchema, OperationDefinitionNode } from 'graphql'
import { rgraphql, PackPrimitive } from 'rgraphql'

describe('JSONDecoder', () => {
  let schema = buildSchema(`
        type RootQuery {
            person: Person
            people: [Person]
        }

        type Person {
            name: String
            height: Int
        }

        schema {
            query: RootQuery
        }
        `)
  it('should decode a value stream properly', () => {
    let qt = new QueryTree(schema)
    let queryDefs = parse(`
        {
            person {
                name
            }
        }
        `)
    let query = qt.buildQuery(queryDefs.definitions[0] as OperationDefinitionNode)
    let decoder = new JSONDecoder(qt.getRoot(), query)
    let rtree = new ResultTree(qt, rgraphql.RGQLValueInit.CacheStrategy.CACHE_LRU, 50)
    rtree.addResultHandler(decoder.getResultHandler())

    rtree.handleValue({ queryNodeId: 1 })
    rtree.handleValue({
      queryNodeId: 2,
      posIdentifier: 1,
      value: { kind: rgraphql.RGQLPrimitive.Kind.PRIMITIVE_KIND_STRING, stringValue: 'test' }
    })
    rtree.handleValue({
      posIdentifier: 1,
      value: { kind: rgraphql.RGQLPrimitive.Kind.PRIMITIVE_KIND_STRING, stringValue: 'override' }
    })

    expect(decoder.getResult()).toEqual({ person: { name: 'override' } })
  })

  /*
    Emitted: []string{"QNode(1)"}
    Emitted: []string{"ArrayIDX(1)"}
    Emitted: []string{"QNode(3)", "Value(6)"}
    Emitted: []string{"QNode(1)"}
    Emitted: []string{"ArrayIDX(1)"}
    Emitted: []string{"QNode(2)", "Value(Joe)"}
  */
  it('should decode a complex value stream properly', () => {
    let qt = new QueryTree(schema)
    let queryDefs = parse(`
        {
            people {
                name
                height
            }
        }
        `)
    let query = qt.buildQuery(queryDefs.definitions[0] as OperationDefinitionNode)
    let decoder = new JSONDecoder(qt.getRoot(), query)
    let rtree = new ResultTree(qt, rgraphql.RGQLValueInit.CacheStrategy.CACHE_LRU, 50)
    rtree.addResultHandler(decoder.getResultHandler())

    rtree.handleValue({ queryNodeId: 1 })
    rtree.handleValue({ arrayIndex: 1 })
    rtree.handleValue({ queryNodeId: 3, value: PackPrimitive(6) })
    rtree.handleValue({ queryNodeId: 1 })
    rtree.handleValue({ arrayIndex: 1 })
    rtree.handleValue({ queryNodeId: 2, value: PackPrimitive('Joe') })

    expect(decoder.getResult()).toEqual({ people: [{ name: 'Joe', height: 6 }] })
  })
})
