 'use strict'
 const azure = require('azure')
 const fs = require('fs')
 const config = require('./server/init/configuration')
 process.env['AZURE_STORAGE_CONNECTION_STRING'] = config.secure.azure.StorageConnectionString
 const Promise = require('bluebird')
 const mkdir = Promise.promisify(require('fs').mkdir)
 const pabs = Promise.promisifyAll(azure.createBlobService()) // PromiseAzureBlobService
 const pats = Promise.promisifyAll(azure.createTableService()) // PromiseAzureTableService

 function checkParameterName (...p) {
   let result = true
   p.forEach(parameter => {
     if (!parameter) {
       result = false
     }
   })

   if (result) {
     return Promise.resolve(result)
   } else {
     console.warn('checkParameterName: parameterName not valid: ')
     throw Error('checkParameterName: parameterName not valid:')
   }
 }

 function cloudCreateContainer (containerName) {
   return checkParameterName(containerName)
  .then(() => pabs.createContainerIfNotExistsAsync(containerName))
 }

 function cloudStoreFile (fileName, containerName) {
   return checkParameterName(fileName, containerName)
  .then(() => pabs.createBlockBlobFromLocalFileAsync(containerName, fileName, fileName))
 }

 function cloudStoreTextToExistingFile (fileName, containerName, txt) {
   return checkParameterName(fileName, containerName, txt)
  .then(() => pabs.appendFromTextAsync(containerName, fileName, txt))
 }

 function cloudStoreTextToFile (fileName, containerName, txt) {
   return checkParameterName(fileName, containerName, txt)
  .then(() => pabs.createAppendBlobFromTextAsync(containerName, fileName, txt))
 }

 function cloudListFile (containerName) {
   return checkParameterName(containerName)
  .then(() => pabs.listBlobsSegmentedAsync(containerName, null))
  .then(result => {
    let transLogListCsv = ''
    let transArrayText = JSON.stringify(result.entries)
    let transArray = JSON.parse(transArrayText)
    let counter = 0
    transArray.forEach(trans => { counter += 1; transLogListCsv = transLogListCsv + '[ ' + counter + ' ] ' + trans.name + '    ' + trans.lastModified + '\n' })
    if (transArray.length > 0) {
      console.log(transLogListCsv)
    } else {
      console.log('[]')
    }
    return {fileArray: transArray, fileList: transLogListCsv}
  })
 }

 function getTimeStampFromFile (fileName, timeIndexInFileName) {
   let timeStamp = parseInt(fileName.split('.')[timeIndexInFileName])
   if (!timeStamp) {
     throw Error('Can not get time stamp from fileName:' + fileName)
   }
   return timeStamp
 }

 function cloudDeleteFilesBeforeDate (date, containerName, timeIndexInFileName) {
   let thisDate = date.getTime()
   return checkParameterName(thisDate, containerName, timeIndexInFileName)
  .then(() => cloudListFile(containerName))
  .then(msgObj => {
    msgObj.fileArray.forEach(fileObj => {
      let timeStamp = getTimeStampFromFile(fileObj.name, timeIndexInFileName)
      if (timeStamp <= thisDate) {
        console.info('Deleteing file: ' + fileObj.name + ' from Azure...')
        cloudDelFile(fileObj.name, containerName)
      }
    })
    return msgObj.fileArray
  })
 }

 function cloudGetFilesBeforeDate (date, containerName, timeIndexInFileName, directory) {
   let thisDate = date.getTime()
   return checkParameterName(thisDate, containerName, timeIndexInFileName, directory)
  .then(() => cloudListFile(containerName))
  .then(msgObj => {
    msgObj.fileArray.forEach(fileObj => {
      let timeStamp = getTimeStampFromFile(fileObj.name, timeIndexInFileName)
      if (timeStamp <= thisDate) {
        console.info('Getting file: ' + fileObj.name + ' from Azure, storeing to:' + directory)
        cloudgetFile(fileObj.name, containerName, directory)
      }
    })
    return msgObj.fileArray
  })
 }

 function cloudgetFile (fileName, containerName, pathToStore) {
   if (!pathToStore) {
     pathToStore = './tmp/'
   }
   return mkdir(pathToStore)
   .catch(err => {
     if (err.code === 'EEXIST') {
       return
     } else {
       Promise.reject(err)
     }
   })
  .then(() => checkParameterName(fileName, containerName))
  .then(() => pabs.getBlobToStreamAsync(containerName, fileName, fs.createWriteStream(pathToStore + fileName)))
 }

 function cloudgetStream (fileName, containerName, localStream) {
   return checkParameterName(fileName, containerName, localStream)
  .then(() => pabs.getBlobToStreamAsync(containerName, fileName, localStream))
 }

 function cloudDelFile (fileName, containerName) {
   return checkParameterName(fileName, containerName)
  .then(() => pabs.deleteBlobAsync(containerName, fileName))
 }

 function cloudCreateTable (tableName) {
   return checkParameterName(tableName)
   .then(() => pats.createTableIfNotExistsAsync(tableName))
 }

 module.exports = {
   cloudStoreFile,
   cloudListFile,
   cloudgetFile,
   cloudgetStream,
   cloudDelFile,
   cloudStoreTextToFile,
   cloudDeleteFilesBeforeDate,
   cloudCreateContainer,
   cloudStoreTextToExistingFile,
   cloudCreateTable,
   cloudGetFilesBeforeDate
 }