## SendKinesisDataToSplunk
This AWS Lambda event handler code demonstrates how to process event triggers from a Kinesis Data Stream and performs the following:
* loop through each Kinesis record
* gunzip the record data buffer to extract the CloudWatch Log records
* send each CloudWatch log record to a Splunk host using Splunk's HTTP event collector API

