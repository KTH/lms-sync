'use strict'
const config = require('./server/init/configuration')
const app = require('kth-node-server')
const azure = require('./azureStorage')

azure.cloudConnect()
app.start()
const consumeMessages = require('./messages/consumeMessages')
consumeMessages.start()

const systemRoutes = require('./server/systemroutes')
app.use(config.full.proxyPrefixPath.uri, systemRoutes)
