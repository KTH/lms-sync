const config = require('../../server/init/configuration')
const Promise = require('bluebird')
const rewire = require('rewire')
const consumeMessages = rewire('../../messages/consumeMessages')

function sendAndWaitUntilMessageProcessed (message) {
  console.log('Send and read a message', message)
  const resultPromise = new Promise((resolve, reject) => {
    consumeMessages.eventEmitter.once('messageProcessed', (msg, result) => {
      console.log('has processed message. Resolve.')
      resolve(result)
    })
  })

  console.log('sending a message to the queue:', config.full.azure.queueName)
  queue.sendQueueMessage(config.full.azure.queueName, message)
  .catch(err => console.error(err))

  return resultPromise
}

function handleMessages (...messages) {
  consumeMessages.__set__('detached', () => {})

  console.log('handle messages', messages.length)
  config.secure.azure.queueName = config.full.azure.queueName = 'lms-sync-integration-tests-' + Math.random().toString(36)
  let receiver, result

  return queue.createQueueIfNotExists(config.full.azure.queueName)
  .then(() => consumeMessages.start())
  .then(_receiver => { receiver = _receiver })
  .then(() => Promise.mapSeries(messages, sendAndWaitUntilMessageProcessed))
  .then(messagesResults => { result = messagesResults })
  .then(() => {
    console.log('Close the receiver...')
    receiver.detach()
    return new Promise((resolve, reject) => receiver.on('detached', () => resolve()))
  })
  .then(() => {
    console.log('Close the connection...')
    const client = consumeMessages.__get__('client')
    client.disconnect()
  })
  .finally(() => queue.deleteQueue(config.full.azure.queueName))
  .then(() => result)
}

const queueConnectionString = `Endpoint=sb://${config.full.azure.host}/;SharedAccessKeyName=${config.full.azure.SharedAccessKeyName};SharedAccessKey=${config.secure.azure.SharedAccessKey}`
const queue = require('node-queue-adapter')(queueConnectionString)
module.exports = {
  handleMessages
}
