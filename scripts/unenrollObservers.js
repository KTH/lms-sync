const inquirer = require('inquirer')
const CanvasApi = require('kth-canvas-api')
process.env['NODE_ENV'] = 'production'
const csvFile = require('../csvFile')
require('colors')
async function createFile () {
  const {api} = await inquirer.prompt(
    {
      message: 'Vilken miljö?',
      name: 'api',
      choices: [
        {name: 'test', value: {apiUrl: 'https://kth.test.instructure.com/api/v1'}},
        {name: 'prod', value: {apiUrl: 'https://kth.instructure.com/api/v1'}},
        {name: 'beta', value: {apiUrl: 'https://kth.beta.instructure.com/api/v1'}}
      ],
      type: 'list'
    })
  const {apiUrl} = api

  const {apiKey} = await inquirer.prompt({
    message: 'Klistra in api nyckel till Canvas här',
    name: 'apiKey',
    type: 'string'
  })

  const canvasApi = new CanvasApi(apiUrl, apiKey)
  canvasApi.logger = {info () {
    for (let arg of arguments) {
      console.log(arg.yellow)
    }
  }}
  try {
    const sectionFileName = 'csv/unenrollObserversSections.csv'
    const coursesFileName = 'csv/unenrollObserversCourses.csv'

    await csvFile.writeLine(['section_id', 'user_id', 'role', 'status'], sectionFileName)
    await csvFile.writeLine(['course_id', 'user_id', 'role', 'status'], coursesFileName)

    const courses = await canvasApi.get(`/accounts/1/courses?per_page=100`)

    const allEnrollments = []
    for (let course of courses) {
      try {
        const enrollments = await canvasApi.get(`/courses/${course.id}/enrollments?role[]=Applied%20pending%20registration%20(Observer)&per_page=100`)
        allEnrollments.push(...enrollments)
        for (let enrollment of enrollments) {
          // console.log('Unenroll the user with the old role (21)')
          await canvasApi.requestUrl(`/courses/${enrollment.course_id}/enrollments/${enrollment.id}`, 'DELETE')
        }
      } catch (e) {
        console.log('an error occured, continue', e)
      }
    }
    console.log('Done.'.green)
    console.log(JSON.stringify(allEnrollments, null, 4))
  } catch (err) {
    console.error(err)
  }
}
createFile()
