'use strict'

const config = require('./server/init/configuration')
const queue = require('node-queue-adapter')(config.secure.azure.queueConnectionString)
const {addDescription} = require('message-type')
const handleMessage = require('./handleMessage')
const deleteMessage = require('./deleteMessage')
require('colors')

function readMessage () {
  console.log('.')
  let message
  return queue
    .readMessageFromQueue(config.secure.azure.queueName)
    .then(msg => {
      message = msg
      if (!msg) {
        // Best way to abort a promise chain is by a custom error according to:
        // http://stackoverflow.com/questions/11302271/how-to-properly-abort-a-node-js-promise-chain-using-q
        throw new Error('abort_chain')
      }

      return msg
    })
    .then(msg => JSON.parse(msg.body))
    .then(addDescription)
    .then(handleMessage)
    .then(() => deleteMessage(message, queue))
    .then(readMessage)
    .catch(e => {
      if (e.message !== 'abort_chain') {
        console.log('\nAn Error occured.....')
        console.error('Exception: ', e)
      }
      return readMessage()
    })
}
readMessage()
