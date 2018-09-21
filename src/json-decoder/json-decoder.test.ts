import { ResultTree } from '../result-tree/result-tree'
import { JSONDecoder } from './json-decoder'
import { QueryTree } from '../query-tree/query-tree'
import { parse, buildSchema, OperationDefinitionNode } from 'graphql'
import { CacheStrategy, Kind } from 'rgraphql'

describe('JSONDecoder', () => {
  it('should decode a value stream properly', () => {
    let schema = buildSchema(`
        type RootQuery {
            person: Person
        }

        type Person {
            name: String
        }

        schema {
            query: RootQuery
        }
        `)
    let qt = new QueryTree(schema)
    let queryDefs = parse(`
        {
            person {
                name
            }
        }
        `)
    let query = qt.buildQuery(queryDefs.definitions[0] as OperationDefinitionNode)
    let decoder = new JSONDecoder(qt, query)
    let rtree = new ResultTree(qt, CacheStrategy.CACHE_LRU, 50)
    rtree.addResultHandler(decoder.getResultHandler())

    rtree.handleValue({ queryNodeId: 1 })
    rtree.handleValue({ queryNodeId: 2 })
    rtree.handleValue({ value: { kind: Kind.PRIMITIVE_KIND_STRING, stringValue: 'test' } })

    expect(decoder.getResult()).toEqual({ person: { name: 'test' } })
  })
})
