# Step 1: Setup the repository
We will build a repository with the following stack:
Node.js, Express, Nx, React, ESBuild, MongoDB, Jest, WebdriverIO

The application will be a monorepo with a compiled react frontend and a compiled node.js backend.

The frontend will be a react application that will be compiled with esbuild.
The backend will be a node.js application that will be compiled with esbuild.

The application will have the following features:
- A login page with email and password
- A register page with email, password, and confirm password
- A dashboard page with a list of users
- A settings page with a form to change the user's email and password
- A logout page

The application will be deployed to a cloud provider such as AWS, Azure, or Google Cloud.

The application will be tested with Jest and WebdriverIO.

The application will be deployed with Nx.

# Step 2: Setup google authentication
In addition to the email and password authentication, we will also support google authentication and other sso providers..
Lets create a model where a user can have multiple sso providers.
Then lets start by supporting the Google OAuth 2.0 API to authenticate users.
prompt me to update the google credentials in the .env file.

# Step 3: Lets add some roles
Each user can have multiple roles.  Lets add the following roles: user, author, admin.
and lets create a dashboard for each role.  The main dashboard should have links to the role dashboards if the user has access to them.

# Step 4: Lets add a generic component that will be used in many places.
This component will be a chat window.  It should have a model that contains a messages array.  The UI will be a list of message objects.  For now lets only have one type of message object that simply displays the message text.  The message will also have a "from" property that will be the username of the user who sent the message. Fixed to the bottom of the UI will be a text input field and a button to send the message. When the user clicks the button, the message should be added to the messages array and the UI should be updated to display the new message.

Lets pass in a key to the ChatWindow and implement a second chat window on the right side of the UserDashboardPage.  Each ChatWindow will have their own key.
Lets add a dropdown to the message sending formto choose which chat window to send the message to.

# Step 5: Lets add a websocket system to the application.
- We will use the WebSocket system to send messages between the server and the chat windows. And the chat window will listen for messages from the server and update the UI.
- The server will listen for messages from the chat window and send the message to the other chat windows. It will not persist anything yet.
- This will require an EventManager on the client side and a UserEventManager on the server side.
- The EventManager will have a method for ChatWindows to subscribe to and listen for events sent to them.  Perhaps the pubsub library can be used for this.
- The EventManager will also have a method for ChatWindows to publish messages to the server.
- The UserEventManager will receive messages and send them back out to appropriate chat windows

# Step 6: Lets add a redis and ioredis to manage session related data
Lets refactor the UserEventManager to register socket IDs and User IDs and manage web sockets across multiple servers using redis.
Lets also make a "channel" lookup in redis to associate socket IDs with a channel.  As a message is sent to a channel, that socket ID is added to a list of sockets that should be broadcast to.   As sockets close or timeout, they are removed from the channel's list.

Let's make sure that messages sent to a channel in the broadcast method are only sent to sockets in the channel's list.

# Step 7: Make message type a union of sub types
We will be sending and receiving many different message types.  In addition to ChatMessage, lets add a ColorfulChatMessage type that adds a color field.  Lets make a generic Message type that has "type" as its common property.  Then lets make ChatMessage and ColorfulChatMessage be subtypes to Message with their type name as the "type" value.  Then lets refactor the UserEventManager and the EventManager to manage any Message type.  The ChatWindow should now display both ChatMessage and ColorfulChatMessage.  Lets also add a color option to the message input form on ChatWindow.

# Step 8: Event Processor
Lets add an EventProcessor that decides what to do with messages.  This will replace the UserEventManager's handler for `deliverToLocalSockets`.  For now the EventProcessor will simply do what `deliverToLocalSockets` does now.

# Step 9: Threaded processing
- lets put Event Processor in a job or a thread.
- But we do not want incoming events to be processed on multiple servers.  We only want the results of the processing to be published to multiple websockets.  It is the outgoing websocket messages that need to be distributed to all servers listening to the PUBSUB_CHANNEL
- Not all processed events end up sending events to the websockets.  Also some processing takes a long time.  Ideally, publishing to the redis server and websockets would happen at the end of the EventProcessorWorker process, if at all.  If objects cannot cross the thread boundary, do we need to move the redis pubsub service outside of the EventManager.  Are there other strategies that might work better?

# Step 10: Add From and To to all messages
The Message base type should include "from" and "to" properties for clarity.  All messages from the client should have `{from: "client", to: "server", channel: ..., timestamp: ..., type: ...}`   And all messages from the server to the client should have `{from: "server", to: "client", channel: ..., timestamp: ..., type: ...}`.  future messages may have client to client or server to server.  But lets refactor the current messages so that messages sent from the ChatWindow are of type="add-text" or type="add-colorful-text".  And the messages returned to the ChatWindow are type="display-text" or type="display-colorful-text".

# Step 11: ChannelId and Documents
- In this next step we will remove the two ChatWindow objects from the User Dashboard.
- Rather than static Channel names we want to generate a channelId.  Also, we want to introduce the idea of documents.
- Each document will have a currentChannelId.  We will start with a current document type of Chat.
- When a user logs in, the user dashboard will display a list of Chat documents to join.
- If none exist, the UI will provide a text field to name a new chat and a button to create the new Chat.   The server will create a new document in a collection of Documents in mongo. It will persist the name and create a unique currentChannelId and then return the document record to the user.
- Or the user can click on an existing document and get the document record.
- When the client receives the document record, it will create a new ChatWindow with a title of the chat.name and establish a websocket with the chat.channelId

# Step 12: Add User to message
To all of the messages, lets add the email address of the sender.  So the add-text messages get the email address of the sending user.  then the display-text messages also get that user's email address.  And the ChatWindow should display the email address of who sent the message.

# Step 13: Persistence
Lets add some persistence of messages.  Each document should have a messages property to persist messages as they come in to the server and as they are generated to go out to the client.  Messages should maintain the order that they arrive or are generated.
When we choose a chat document, let's return all the existing messages to the client's EventManager so that it can play those messages back and rebuild the UI before processing any incoming new messages for this channel.

# Step 14: Fix Chat selection
When I choose a new chat document, we should destroy the existing one and replace it with the new one.  This also means telling the backend to close the websocket's connetion to that channel and updating the redis state.

# Step 15: Create dynamically loaded components
When we set the activeDoc in the UserDashboardPage we don't know what kind of document will get returned.  So lets let the document type determine which component to display in the activeDoc div.  Let's not statically import the ChatWindow class into the UserDashboard.  Instead lets dynamically import it based on the document type.  We should have a helper class that maps document types to components to import.

# Step 16: Create dynamically loaded components for messages
Now we want to allow document components to dynamically load sub components depending on message type.  Lets turn the display of "display-text" and "display-colorful-text" into components and dynamically load them only if the message requires it.

# Step 17: Create an AI service
Lets create an AIEventManager that receives messages and returns messages.
- Let's start in the EventProcessorWorker when an "add-text" input message arrives.
- We will create a new message that will send a prompt to the AIEventManager.
- The new message will have a prompt that asks an AI service to vet the incoming "add-text" text for any inappropriate content.   The prompt will ask for a json response that is another message of either "valid-text" or "inappropriate-text".
- For now lets not build the AI request, we will mock up a random response of one of those two responses.
- Messages sent to the AIEventManager will be {from: "server", to: "ai-service"} and messages sent back from the AIEventManager will be {from: "ai-service", to: "server"}
- finally, if the response is "valid-text" the EventProcessorWorker will respond to the client with a "display-text" message.  If the response from ai is "inappropriate-text" then the EventProcessorWorker will respond with a "display-colorful-text" message that is the color red and simply displays "inappropriate text".

Ok. Now lets fix the flow in the EventProcessorWorker so that when the worker receives a "add-text" message, it creates a new message for the AIEventManager called "validate-text".  This new message has a property "text".  It does not await a response.  Instead, the message is sent to the AIEventManager and it starts a new worker.  When it determines a random response message, it will make a call to the EventProcessor to handle the response and the EventProcessorWorker will respond appropriately.
Let's modify the aiEventManager.validate() call.  We don't want AIEventManager to know what the message is doing.  We simply want to publish a message.  So aiEventManager.publish(validateMsg) is better.  Then the AIEventManager will handle the message type.
We also don't want the AIEventManager to rely on a callback.  In the EventProcessorWorker, when we construct the AIEventManager we will not pass anything in.  We will simply publish the message and then we are done.  The AIWorker then needs to instantiate an EventProcessor and publish a message to it.
Let's simplify the EventProcessor and EventProcessorWorker by removing the separate workflow of handleAiResult.  Lets have all messages from UserEventManager and from AIWorker all go through the EventProcessor.process() method.  All messages coming out of the AIWorker will then be of type InboundMessage.  The EventProcessorWorker.on(message) method will handle ai responses and user input message in the same algorithm.

And now lets create an ai service that supports two kinds of ai agents.  We can switch from one agent to the other by changing a configuration in the AIEventProcessor.  One service will hit the Anthropic endpont and the other will hit the  OpenAI endpoint.  The service will take a prompt and and service type params and then returns a json response.
Lets have the AIEventManager provide the prompt and send it to the ai service, then validate that the response is either a valid message of type "valid-text" or "inappropriate-text".  The prompt will need to be written to ensure that the agent returns valid json of one of the two types of messages.

# Step 18: Lets build a few more components
- lets make a dynamic react component that takes a message of type "simple-tab" and that has an array of `tab` objects as a parameter.  Each tab object has a title and locationId property.  For each tab we will display a tab with the title that toggles the display of a div with the locationId as its id.
- lets also make a dynamic react component that takes a message of type "horizontal-workspace" that takes an array of "panel" objects, each with properties "locationId" and "widthProportion".   Each panel will be laid out as full height and proportional width based on the panel property "widthProportion" of the whole width available in the containing element.
- lets build a vertical dynamic react component that takes a message of type "horizontal-workspace" and is similar to the "horizontal-workspace"
- let's add "overflow-x" and "overflow-y" as possible properties to the panel definitions and apply these properties to the panel if present.  Otherwise, the overflow-x will default to "auto" and overflow-y will default to "hidden".  Do this for both the horizotal-workspace and the vertical-workspace.
- lets make a dynamic react component that takes a message of type "display-json". This will have a property "json" that is an object.  The object should be prettified and displayed in a div.
- and lastly lets add a property of "targetId" to all dynamic components.  This is the locationId that we will look for in the dom to render the component.  The id will be a uuid that should already exist in the dom upon mounting the component, if it does not, we should provide a timeout callback to try rendering again one second later.   upon the second attempt if we fail to find the targetId in the dom, we display an red alert saying "target id not found".

# Step 19: Let's redefine the user dashboard with a script
- lets create some hardcoded workflow files written in json. These will be scripts that control what messages get sent to the user upon login.  The document








## Misc notes
Bucket Pattern/Subset Pattern: If a document has a large list (e.g., users with millions of log entries), store only the most recent/relevant 100-200 items in the main document. Store the rest in a separate "items" collection.
Use Separate Collection: Model large lists as individual documents in a separate collection, referencing the parent document ID.
Pagination: When querying large lists, use limit(), skip(), and range-based pagination (using indexed fields like _id or timestamp) rather than loading everything at once.
Sharding: For extremely large datasets, shard the collection based on the parent ID to distribute the load across multiple servers.
Bulk Operations: Use {Link: bulkWrite() https://www.mongodb.com/community/forums/t/best-practices-for-bulkwrite-performance-with-large-documents-and-array-fields-in-a-2-node-replica-set/297163} to add items in batches, reducing network round trips.
Indexing: Create compound indexes on the parent ID and the sorting field (e.g., { parentId: 1, createdAt: -1 }) to speed up retrieval.


claude.md
Business model
tools
how things work - key workflows
what I'm working on currently
Rules - guardrails - things claude should always do

