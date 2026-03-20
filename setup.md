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



Bucket Pattern/Subset Pattern: If a document has a large list (e.g., users with millions of log entries), store only the most recent/relevant 100-200 items in the main document. Store the rest in a separate "items" collection.
Use Separate Collection: Model large lists as individual documents in a separate collection, referencing the parent document ID.
Pagination: When querying large lists, use limit(), skip(), and range-based pagination (using indexed fields like _id or timestamp) rather than loading everything at once.
Sharding: For extremely large datasets, shard the collection based on the parent ID to distribute the load across multiple servers.
Bulk Operations: Use {Link: bulkWrite() https://www.mongodb.com/community/forums/t/best-practices-for-bulkwrite-performance-with-large-documents-and-array-fields-in-a-2-node-replica-set/297163} to add items in batches, reducing network round trips.
Indexing: Create compound indexes on the parent ID and the sorting field (e.g., { parentId: 1, createdAt: -1 }) to speed up retrieval.


