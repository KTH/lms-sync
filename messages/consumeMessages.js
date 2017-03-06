'use strict'
const Promise = require('bluebird')
const config = require('../server/init/configuration')
const log = require('../server/init/logging')
const {addDescription} = require('message-type')
const handleMessage = require('./handleMessage')
require('colors')
const {Client: AMQPClient, Policy} = require('amqp10')
const urlencode = require('urlencode')
const client = new AMQPClient(Policy.Utils.RenewOnSettle(1, 1, Policy.ServiceBusQueue))

function start () {
  return client.connect(`amqps://RootManageSharedAccessKey:${urlencode(config.full.secure.azure.SharedAccessKey)}@lms-queue.servicebus.windows.net`)
    .then(() => client.createReceiver(config.full.azure.queueName))
    .then(receiver => {
      log.info('receiver created....')

      receiver.on('errorReceived', err => {
        log.warn('An error occured when trying to receive message from queue', err)
        return receiver.reject(err)
      })

      receiver.on('message', message => {
        log.info('New message from ug queue', message)
        if (message.body) {
          return _processMessage(message)
        } else {
          log.info('Message is empty or undefined, deteting from queue...', message)
          return receiver.reject(message)
        }
      })

      function _processMessage (MSG) {
        return Promise.resolve(MSG)
        .then(initLogger)
        .then(addDescription)
        .then(handleMessage)
        .then(_result => {
          log.info('result from handleMessage', _result)
        })
        .then(() => receiver.accept(MSG))
        .catch(e => {
          log.error(e)
          log.info('Error Occured, releaseing message back to queue...', MSG)
          return receiver.reject(MSG, e)
        })
      }

      return receiver
    })
}

function initLogger (msg) {
  let config
  if (msg) {
    const {body} = msg
    config = {
      kthid: body && body.kthid,
      ug1Name: body && body.ug1Name,
      ugversion: (msg && msg.customProperties && msg.customProperties.ugversion) || undefined,
      messageId: (msg && msg.brokerProperties && msg.brokerProperties.MessageId) || undefined
    }
  } else {
    config = {}
  }

  log.init(config)

  return msg && msg.body
}

module.exports = {
  start
}
