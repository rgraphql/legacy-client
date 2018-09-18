import Client from '../src/soyuz'

/**
 * Dummy test
 */
describe('Dummy test', () => {
  it('works if true is truthy', () => {
    expect(true).toBeTruthy()
  })

  it('Client is instantiable', () => {
    expect(new Client()).toBeInstanceOf(Client)
  })
})
