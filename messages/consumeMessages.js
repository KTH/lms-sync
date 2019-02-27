const log = require('../server/logging')
const EventEmitter = require('events')
const eventEmitter = new EventEmitter()
const history = require('./history')
const { addDescription } = require('kth-message-type')
const handleMessage = require('./handleMessage')
const container = require('rhea')

// The number of credits give to the message receiver at a time i.e. how many messages can be handled in parallell.
// Note that the code logic is primarily adapted to handle one message, so this value should not be altered without code improvements.
const CREDIT_INCREMENT = 1

// Variable for determining behavior on connection closed.
let reconnectClosedConnection = true
// Simply saving a reference to the latest connection, for testing purposes.
let connection // eslint-disable-line

/**
 * To make sure rhea is consuming one message at a time, we are manually handling the receiver's credits.
 * Upon opening a receiver, it is handed a number of credits equal to the constant CREDIT_INCREMENT.
 * This credit is consumed once a message is received, and yet another credit given once it has been handled.
 * To be able to handle both a production scenario where we never want the connection to close and a testing scenarion,
 * there is a parameter for reconnecting even when a connection is closed.
 */
async function start (reconnect = true) {
  reconnectClosedConnection = reconnect
  log.info(`connecting to the following azure service bus: ${process.env.AZURE_SERVICE_BUS_URL}`)
  connection = container.connect({
    transport: 'tls',
    host: process.env.AZURE_SERVICE_BUS_URL,
    hostname: process.env.AZURE_SERVICE_BUS_URL,
    port: 5671,
    username: process.env.AZURE_SHARED_ACCESS_KEY_NAME,
    password: process.env.AZURE_SHARED_ACCESS_KEY,
    container_id: 'lms-client',
    reconnect: true,
    reconnect_limit: 100
  })
}

function initLogger (msg) {
  let config
  if (msg) {
    const { body } = msg
    config = {
      kthid: body && body.kthid,
      ug1Name: body && body.ug1Name,
      ugversion: (msg && msg.applicationProperties && msg.applicationProperties.UGVersion) || undefined,
      messageId: (msg && msg.properties && msg.properties.messageId) || undefined
    }
  } else {
    config = {}
  }

  log.init(config)

  return msg && msg.body
}

container.on('connection_open', function (context) {
  log.info('Connection was opened!')
  log.info(`opening receiver for subscription: ${process.env.AZURE_SUBSCRIPTION_NAME} @ ${process.env.AZURE_SUBSCRIPTION_PATH}`)
  context.connection.open_receiver({
    name: process.env.AZURE_SUBSCRIPTION_NAME,
    source: {
      address: process.env.AZURE_SUBSCRIPTION_PATH,
      dynamic: false,
      durable: 2, // NOTE: Value taken from rhea official code example for durable subscription reader.
      expiry_policy: 'never'
    },
    autoaccept: false,
    credit_window: 0
  })
})

container.on('connection_close', function (context) {
  log.warn('Connection was closed!')
  if (reconnectClosedConnection) {
    log.info('Attempting to connect to azure once more!')
    start()
  }
})

container.on('connection_error', function (context) {
  log.error(`Connection had an error: ${context.connection.get_error()}`)
})

container.on('disconnected', function (context) {
  log.warn('Connection was disconnected!')
})

container.on('receiver_open', function (context) {
  log.info('Receiver was opened.')
  log.debug(`Adding ${CREDIT_INCREMENT} credit(s).`)
  context.receiver.add_credit(CREDIT_INCREMENT)
})

container.on('receiver_close', function (context) {
  log.warn('Receiver was closed!')
  log.warn(context.receiver.remote.detach)
})

container.on('message', async function (context) {
  let jsonData
  let result
  try {
    log.debug(`Consumed 1 credit. `)
    if (context.message.body.typecode === 117) {
      jsonData = { body: JSON.parse(Buffer.from(context.message.body.content).toString()) }
      initLogger(jsonData)
      log.info(`New message from ug queue for AMQP container ${context.connection.container_id}`, jsonData)
      history.setIdleTimeStart()
      if (jsonData.body) {
        try {
          const body = addDescription(jsonData.body)
          result = await handleMessage(body)
          log.info('result from handleMessage', result)
          context.delivery.accept()
        } catch (e) {
          log.error(e)
          log.info('Error Occured, releasing message back to queue...', jsonData)
          context.delivery.modified({ deliveryFailed: true, undeliverable_here: false })
        }
      } else {
        log.info('Message is empty or undefined, deleting from queue...', jsonData)
        context.delivery.accept()
      }
    } else {
      log.error(`An unexpected content type was received: ${context.message.body.typecode}`)
      context.delivery.modified({ deliveryFailed: true, undeliverable_here: false })
    }
  } catch (err) {
    log.error(`An unhandled exception occured in onMessage: ${err}`)
  } finally {
    log.debug(`Adding ${CREDIT_INCREMENT} credit(s).`)
    context.receiver.add_credit(CREDIT_INCREMENT)
    eventEmitter.emit('messageProcessed', jsonData, result)
  }
})

module.exports = {
  start,
  eventEmitter
}
