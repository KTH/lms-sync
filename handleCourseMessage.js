const {type} = require('message-type')
const config = require('./server/init/configuration')
const canvasApi = require('canvas-api')(config.full.canvas.apiUrl, config.secure.canvas.apiKey)
var Promise = require('bluebird')
const fs = Promise.promisifyAll(require('fs'))
const colors = require('colors')

function _parseError(err) {
  // this function has to parse the error string, due to canvas API Promise rejecting error as a string, to be addressed later
  let errorCodeString = "StatusCodeError:"
  let errorCode = false
  let errorCodeLength = 4
  var errorIndex = err.indexOf(errorCodeString);
  if (errorIndex > 0) {
    let begin = errorIndex + errorCodeString.length
    let end = begin + errorCodeLength
    errorCode = parseInt(err.substring(begin, end))
  }

  if (errorCode) {
    return errorCode
  }

  return false
}


function _handleError(err,sisCourseCode) {

  if  (typeof(err) === "string") // when in arror, canvas API returns a prmoise reject with a string value, future code refactroring...
  {
    let eCode = _parseError(err)
    if (eCode == 404) // The course code is not in canvas, do nothing.....
    {
      console.warn("Course does not exist in canvas, skipping, ".red + sisCourseCode.red)
      return Promise.resolve("Course does not exist in canvas")
    }
    else if (eCode > 400) // Besides course not incanvase, Probably other problems with canvas.....
    {
      console.warn("Canvas is not accessable, Invalid token or other Canvas related errors..... ".red + sisCourseCode.red)
      return Promise.reject(new Error(err))
    }
    else { //It is an error and unrelated to canvas HTTP requests probably IO errors
      console.warn("Other error..... ".red + sisCourseCode.red)
      return Promise.reject(new Error(err))
    }
  }// Handels error of type error

    console.warn("Some Error occured, rejecting promise..... ".red + sisCourseCode.red)
    return Promise.reject(err)

}

function _craeteCsvFile(msg){
  let data = ''
  let csvString = ''
  let header = 'course_id,user_id,role,status\n'
  msg.member.map(user => csvString += `${sisCourseCode},${user},${msgtype},active\n`)
  data = header + csvString
  console.info(data)
  return data

}

function _process (msg) {

  let course = null
  let termin = null
  let year = null
  let ladok = null
  let sisCourseCode = null
  let myRe = null
  let myArray = []
  let msgtype = msg._desc.userType
  let d = 0
  let end = 0
  let csvfileName = './CSV/' + 'enrollments_' + msgtype + '_'
  let msgfileName = './MSG/' + 'msg_' + msgtype + '_'

  if (msgtype === type.students) { // ladok2.kurser.DM.2517.registrerade_20162.1
    myRe = /^(\w+).(\w+).(\w+).(\w+).(\w+)_(\d\d)(\d\d)(\d).(\d+)/g
    myArray = myRe.exec(msg.ug1Name)
    if (myArray != null) {
      let courseInOne = 3
      let courseInTwo = 4
      let terminIn = 8
      let yearIn = 7
      let ladokIn = 9
      course = myArray[courseInOne] + myArray[courseInTwo]
      termin = myArray[terminIn] === 1 ? 'HT' : 'VT'
      year = myArray[yearIn]
      ladok = myArray[ladokIn]
      sisCourseCode = course + termin + year + ladok
    } else { // failed to parse course
      console.warn('\nCourse code not parsable from ug1Name structure: ' + msg.ug1Name)
      return Promise.resolve("Key parse error, Student")
    }
  }

  if (msgtype === type.teachers || msgtype === type.assistants) { // edu.courses.AE.AE2302.20162.1.teachers edu.courses.DD.DD1310.20162.1.assistants
    myRe = /^edu.courses.(\w+).(\w+).(\d\d)(\d\d)(\d).(\d).(\w+)$/g
    myArray = myRe.exec(msg.ug1Name)
    if (myArray != null) {
      let courseIn = 2
      let terminIn = 5
      let yearIn = 4
      let ladokIn = 6
      course = myArray[courseIn]
      termin = myArray[terminIn] === 1 ? 'HT' : 'VT'
      year = myArray[yearIn]
      ladok = myArray[ladokIn]
      sisCourseCode = course + termin + year + ladok
    }
    else { // failed to parse course
      console.warn('\nCourse code not parsable from ug1Name structure: ' + msg.ug1Name)
      return Promise.resolve("Key parse error, Teacher or Assistant")
    }
  }
  d = new Date()
  console.info(`\nIn_process ${sisCourseCode}, processingfor ${msgtype}`)

  csvfileName = csvfileName + sisCourseCode + '_' + d + '.csv'
  msgfileName = msgfileName + sisCourseCode + '.' + d + '.msg'


  return canvasApi.getCourse(sisCourseCode)
          .then(result => _craeteCsvFile(msg))
          .then(csvData=> {
                        console.info('\nGoing to open file: ' + csvfile + ' ' + msgfile)
                        return fs.writeFileAsync(csvfile, data, {})})
          .then(() => fs.writeFileAsync(msgfile, JSON.stringify(msg, null, 4), {}))
          .then(() => canvasApi.sendCreatedUsersCsv(csvfile))
          .then(canvasReturnValue => console.log(canvasReturnValue, null, 4))
          .catch(error => _handleError(error,sisCourseCode))}





module.exports = function (msg) {
  console.info('\nProcessing for msg..... ' + msg.ug1Name)
  var msgtype = msg._desc.userType
  if (msg._desc && (msgtype === type.students || msgtype === type.teachers || msgtype === type.assistants)) {
    return _process(msg)
  }
  else {
    console.warn('\nThis is something else than students, teacher, assistant, we can probably wait with this until the students is handled', JSON.stringify(msg, null, 4))
    return Promise.resolve("Unknown flag: " + msgtype)
  }
}
