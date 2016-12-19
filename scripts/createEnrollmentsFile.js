const Promise = require('bluebird')
const ldap = require('ldapjs')
const fs = Promise.promisifyAll(require('fs'))
const config = require('../server/init/configuration')
const csvFile = require('../csvFile')
require('colors')

const constants = {
  term: '2017:1',
  period: '3'
}
const attributes = ['ugKthid', 'name']
const fileName = `csv/enrollments-${constants.term}-${constants.period}.csv`
const coursesFileName = `csv/courses-${constants.term}-${constants.period}.csv`
const columns = [
  'course_id',
  'user_id',
  'role',
  'status'
]

const ldapClient = Promise.promisifyAll(ldap.createClient({
  url: config.secure.ldap.client.url
}))

/*
* For string array with ldap keys for users, fetch every user object
*/
function getUsersForMembers (members) {
  return Promise.map(members, member => {
    return ldapClient.searchAsync('OU=UG,DC=ug,DC=kth,DC=se', {
      scope: 'sub',
      filter: `(distinguishedName=${member})`,
      timeLimit: 10,
      paging: true,
      attributes,
      paged: {
        pageSize: 1000,
        pagePause: false
      }
    })
  .then(res => new Promise((resolve, reject) => {
    const users = []
    res.on('searchEntry', ({object}) => users.push(object))
    res.on('end', () => resolve(users))
    res.on('error', reject)
  }))
  })
  .then(flatten)
}

function flatten (arr) {
  return [].concat.apply([], arr)
}

function searchGroup (filter) {
  return ldapClient.searchAsync('OU=UG,DC=ug,DC=kth,DC=se', {
    scope: 'sub',
    filter,
    timeLimit: 11,
    paged: true
  })
  .then(res => new Promise((resolve, reject) => {
    res.on('searchEntry', ({object}) => resolve(object.member)) // We will get one result for the group where querying for
    res.on('end', ({object}) => resolve(object && object.member))
    res.on('error', reject)
  }))
  .then(member => {
    // Always use arrays as result
    if (typeof member === 'string') {
      return [member]
    } else {
      return member || []
    }
  })
}

/*
* Fetch the members for the examinator group for this course.
* Return a similar array as the in-parameter, with the examinators added
*/
function addExaminators ([teachersMembers, assistantsMembers, courseresponsibleMembers], courseCode) {
  const courseInitials = courseCode.substring(0, 2)
  return searchGroup(`(&(objectClass=group)(CN=edu.courses.${courseInitials}.${courseCode}.examiner))`)
  .then(examinatorMembers => {
    return [teachersMembers, assistantsMembers, courseresponsibleMembers, examinatorMembers]
  })
}

/*
* For the given course, fetch all user types from UG and add write all of them to the enrollments file
*/
function writeUsersForCourse ([sisCourseId, courseCode, name]) {
  console.log('writing users for course', courseCode)

  function writeUsers (users, role) {
    return Promise.map(users, user => csvFile.writeLine([sisCourseId, user.ugKthid, role, 'active'], fileName))
  }

  return Promise.map(['teachers', 'assistants', 'courseresponsible'], type => {
    const courseInitials = courseCode.substring(0, 2)
    const startTerm = constants.term.replace(':', '')
    const roundId = sisCourseId.substring(sisCourseId.length - 1, sisCourseId.length)

    return searchGroup(`(&(objectClass=group)(CN=edu.courses.${courseInitials}.${courseCode}.${startTerm}.${roundId}.${type}))`)
  })
  .then(arrayOfMembers => addExaminators(arrayOfMembers, courseCode))
  .then(arrayOfMembers => Promise.map(arrayOfMembers, getUsersForMembers))
  .then(([teachers, assistants, courseresponsible, examinators]) => Promise.all([
    writeUsers(teachers, 'teacher'),
    writeUsers(courseresponsible, 'Course Responsible'),
    writeUsers(assistants, 'ta'),
    writeUsers(examinators, 'Examiner')
  ])
  )
}

/*
* Reads the courses file and splits it's content into an array of arrays.
* One array per line, containing one array per column
*/
function getAllCoursesAsLinesArrays () {
  return fs.readFileAsync(coursesFileName, 'utf8')
  .catch(e => console.error('Could not read the courses file. Have you run the npm script for creating the courses csv file? '.red, e))
  .then(fileContentStr => fileContentStr.split('\n')) // one string per line
  .then(lines => lines.splice(1, lines.length - 2)) // first line is columns, last is new empty line. Ignore them
  .then(lines => lines.map(line => line.split(','))) // split into values per column
}

function deleteFile () {
  return fs.unlinkAsync(fileName)
      .catch(e => console.log("couldn't delete file. It probably doesn't exist. This is fine, let's continue"))
}

function bindLdapClient () {
  return ldapClient.bindAsync(config.secure.ldap.bind.username, config.secure.ldap.bind.password)
}

function createFileAndWriteHeadlines () {
  return csvFile.writeLine(columns, fileName)
}

// Run the script
deleteFile()
.then(bindLdapClient)
.then(createFileAndWriteHeadlines)
.then(getAllCoursesAsLinesArrays)
.then(linesArrays => Promise.mapSeries(linesArrays, writeUsersForCourse)) // write all users for each course to the file
.then(() => console.log('Done!'.green))
.catch(e => console.error(e))
.finally(() => ldapClient.unbindAsync())
