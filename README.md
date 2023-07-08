This is an implementation of a Google Cloud Function. It surfaces an API to be used as the "Request Url" endpoint for a Slack App, called Buddy Up.

The Buddy Up app's primary purpose is to facilitate 1-1 meetups within a Slack channel. The core scenario is to automatically match users in a Slack channel once a month via a message, something like the message shown below:

<img width="768" alt="Buddy Up Message" src="https://github.com/alibad/buddy_up_google_cloud_function/assets/6937273/6571aa13-282f-4551-997b-b60fed1b8e65">

For details on how test this code locally or in production, check out this [blog post](https://medium.com/@alibadereddin/building-the-backend-for-a-slack-app-with-google-cloud-functions-bdb98c09497a).
