import { QueryTree } from '../src/query-tree/query-tree'
import { QueryTreeNode } from '../src/query-tree/query-tree-node'
import { QueryTreeHandler } from '../src/query-tree/query-tree-handler'
import { parse, print, buildSchema, OperationDefinitionNode } from 'graphql'
import { IRGQLQueryTreeNode, IRGQLQueryTreeMutation } from 'rgraphql'

function mockSchema() {
  return buildSchema(`
  type RootQuery {
    allPeople(age: Int): [Person]
    person(distance: Int): Person
  }

  type Person {
    name: String
    age: Int
    description: String
  }

  schema {
    query: RootQuery
  }
  `)
}

function mockAst() {
  return parse(
    `query myQuery {
  allPeople(age: 40) {
    name
  }
  person(distance: 5) {
    name
  }
}
query mySecondQuery($distance: Int) {
  allPeople(age: 40) {
    description
  }
  person(distance: $distance) {
    age
  }
}
`
  )
}

describe('QueryTreeNode', () => {
  it('should build a tree properly', () => {
    let queryAst = mockAst()
    let handler: QueryTreeHandler = (mutation: IRGQLQueryTreeMutation) => {
      console.log('Applying:')
      console.log(mutation)
    }
    let schema = mockSchema()
    let tree = new QueryTree(schema, handler)

    let querya = tree.buildQuery(queryAst.definitions[0] as OperationDefinitionNode, {})
    let queryb = tree.buildQuery(queryAst.definitions[1] as OperationDefinitionNode, {
      distance: 10
    })
    // expect(tree.children.length).toBe(3)

    tree.detach(querya)
    // expect(tree.children.length).toBe(0);
    console.log(queryb)
  })
  it('should build a proto tree properly', () => {
    let ast = mockAst()
    let schema = mockSchema()
    let tree = new QueryTree(schema, null)
    let query = tree.buildQuery(<any>ast.definitions[0], {})

    let res = tree.buildProto()
    expect(res).toEqual(<IRGQLQueryTreeNode>{
      id: 0,
      fieldName: '',
      directive: [],
      args: [],
      children: [
        {
          id: 1,
          fieldName: 'allPeople',
          directive: [],
          args: [
            {
              name: 'age',
              variableId: 0
            }
          ],
          children: [
            {
              id: 2,
              fieldName: 'name',
              directive: [],
              args: [],
              children: []
            }
          ]
        },
        {
          id: 3,
          fieldName: 'person',
          directive: [],
          args: [
            {
              name: 'distance',
              variableId: 1
            }
          ],
          children: [
            {
              id: 4,
              fieldName: 'name',
              directive: [],
              args: [],
              children: []
            }
          ]
        }
      ]
    })
  })

  it('should detect differing arguments', () => {
    let ast = parse(
      `
query myQuery {
  person(distance: 5) {
    name
  }
}
query mySecondQuery {
  person(distance: 50) {
    name
  }
}
`
    )
    let schema = mockSchema()
    let node = new QueryTree(schema, null)
    let sel1 = <any>ast.definitions[0]
    let sel2 = <any>ast.definitions[1]
    let q1 = node.buildQuery(sel1, {})
    let q2 = node.buildQuery(sel2, {})
    // expect(node.children.length).toBe(2)
  })
})
