/**
 * Splunk logging using AWS Lambda from Kinesis Data Stream
 *
 * This function processes event triggers from a Kinesis Data Stream and performs the following:
 * a. loop through each Kinesis record
 * b. gunzip the record data buffer to extract the CloudWatch Log records
 * c. send each CloudWatch log record to a Splunk host using Splunk's HTTP event collector API.
 *
 * Define the following Environment Variables in the console below to configure
 * this function to log to your Splunk host:
 *
 * 1. SPLUNK_HEC_URL: URL address for your Splunk HTTP event collector endpoint.
 * Default port for event collector is 8088. Example: https://host.com:8088/services/collector
 *
 * 2. SPLUNK_HEC_TOKEN: Token for your Splunk HTTP event collector.
 * To create a new token for this Lambda function, refer to Splunk Docs:
 * http://docs.splunk.com/Documentation/Splunk/latest/Data/UsetheHTTPEventCollector#Create_an_Event_Collector_token
 */
const loggerConfig = {
    url: process.env.SPLUNK_HEC_URL,
    token: process.env.SPLUNK_HEC_TOKEN,
};

const SplunkLogger = require('./lib/mysplunklogger');
const logger = new SplunkLogger(loggerConfig);
const zlib = require('zlib');
const http = require('http');

exports.handler = async (event, context, callback) => {
    console.log('Received event:', JSON.stringify(event, null, 2));
    let payload = null;
    let kinesispayload = null;
    for (const record of event.Records) {
        // Kinesis data is base64 encoded so we decode it here
        kinesispayload = Buffer.from(record.kinesis.data, 'base64').toString('ascii');
        payload = record.kinesis.data;
    }

    // the kinesis data is actually the CWLog record in gzip format.  
    const cwpayload = Buffer.from(payload, 'base64');

    // CloudWatch Logs are gzip compressed so expand here
    // so we gunzip the data payload 
    zlib.gunzip(cwpayload, (err, result) => {
        if (err) {
            console.log('Error unzipping CWLog record:', err)
        } else {
            const parsed = JSON.parse(result.toString('ascii'));
            let count = 0;
            if ((parsed.logEvents) && (parsed.messageType === 'DATA_MESSAGE')) {
                parsed.logEvents.forEach((item) => {
                    /* Log event to Splunk with explicit event timestamp.
                    - Use optional 'context' argument to send Lambda metadata e.g. awsRequestId, functionName.
                    - Change "item.timestamp" below if time is specified in another field in the event.
                    - Change to "logger.log(item.message, context)" if no time field is present in event. */
                    //logger.logWithTime(item.timestamp, item.message, context);

                    // Log JSON objects to Splunk
                    logger.log(item);

                    /* Alternatively, UNCOMMENT logger call below if you want to override Splunk input settings */
                    /* Log event to Splunk with any combination of explicit timestamp, index, source, sourcetype, and host.
                    - Complete list of input settings available at http://docs.splunk.com/Documentation/Splunk/latest/RESTREF/RESTinput#services.2Fcollector */
                    // logger.logEvent({
                    //     time: new Date(item.timestamp).getTime() / 1000,
                    //     host: 'serverless',
                    //     source: `lambda:${context.functionName}`,
                    //     sourcetype: 'httpevent',
                    //     index: 'main',
                    //     event: item.message,
                    // });

                    count += 1;
                });
            }
            // Send all the events in a single batch to Splunk
            logger.flushAsync((error, response) => {
                if (error) {
                    callback(error);
                } else {
                    console.log(`Response from Splunk:\n${response}`);
                    console.log(`Successfully processed ${count} log event(s).`);
                    callback(null, count); // Return number of log events
                }
            });
        }
    });
    console.log('Completed processing record.')
    return `Successfully processed ${event.Records.length} records.`;
};

