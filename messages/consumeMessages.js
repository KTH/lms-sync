'use strict'
const Promise = require('bluebird')
const config = require('../server/init/configuration')
const queue = require('node-queue-adapter')(config.secure.azure.queueConnectionString)
const log = require('../server/init/logging')
const {addDescription} = require('message-type')
const handleMessage = require('./handleMessage')
require('colors')

let isReading = false

function start () {
  setInterval(readMessageUnlessReading, 50)
}

function abort () {
  // Best way to abort a promise chain is by a custom error according to:
  // http://stackoverflow.com/questions/11302271/how-to-properly-abort-a-node-js-promise-chain-using-q

  throw new Error('abort_chain')
}

function abortIfNoMessage (msg) {
  if (!msg || !msg.body) {
    abort()
  }

  return msg
}

function parseBody (msg) {
  return Promise.resolve()
  .then(() => JSON.parse(msg.body))
  .catch(e => {
    log.warn('an error occured while trying to parse json:', e, msg)
    queue.deleteMessageFromQueue(msg)
    abort()
  })
}
function readMessage () {
  isReading = true
  let message

  return queue
    .readMessageFromQueue(config.full.azure.queueName)
    .then(msg => {
      message = msg
      log.debug('message received from queue', msg)
      return message
    })
    .then(abortIfNoMessage)
    .then(parseBody)
    .then(addDescription)
    .then(handleMessage)
    .then(() => queue.deleteMessageFromQueue(message))
    .catch(e => {
      if (e.message !== 'abort_chain') {
        log.error(e)
      }
    })
    .finally(() => {
      isReading = false
    })
}

function readMessageUnlessReading () {
  if (isReading) {
    // console.log('is already reading a message, abort')
    return
  } else {
    readMessage()
  }
}

module.exports = {
  start
}
