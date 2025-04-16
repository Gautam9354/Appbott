require('dotenv').config();
const mongoose = require('mongoose');
//const PQueue = require('p-queue'); // For rate-limiting
const TelegramBot = require('node-telegram-bot-api');
let fetch;
let PQueue;

(async () => {
    fetch = (await import('node-fetch')).default;
    PQueue = (await import('p-queue')).default; // Ensure pLimit is imported correctly
})();
// Replace 'YOUR_BOT_TOKEN' with your actual bot token
const token = process.env.BOT_TOKEN;

// MongoDB connection URI
const mongoURI = "mongodb+srv://stongiron:EIjjgqR0FwYf6EbE@appbot.ri7vqmk.mongodb.net/apk?retryWrites=true&w=majority&appName=appbot";

// Connect to MongoDB
mongoose.connect(mongoURI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
    .then(() => console.log('Connected to MongoDB'))
    .catch((err) => console.error('Error connecting to MongoDB:', err));

// Define a Mongoose schema for storing payment information
const paymentSchema = new mongoose.Schema({
    userId: Number,
    chatId: Number,
    utrNumber: String,
    paymentStatus: Object,
    createdAt: { type: Date, default: Date.now }
});

const Payment = mongoose.model('Payment', paymentSchema);

const fileSchema = new mongoose.Schema({
    fileId: String,
    uploadedAt: { type: Date, default: Date.now }
});

const File = mongoose.model('File', fileSchema);

const userSchema = new mongoose.Schema({
    userId: Number,
    chatId: Number,
    firstName: String,
    lastName: String,
    username: String,
    joinedAt: { type: Date, default: Date.now }
});

const User = mongoose.model('Buyer', userSchema);


// Create a bot instance
const bot = new TelegramBot(token, { polling: true });

// Admin ID (replace with your actual admin ID)
const adminId = '7432287184'; // Replace with the actual admin ID
const ADMIN_ID = 7432287184;
// Handle /upload command for admin
bot.onText(/\/upload/, async (msg) => {
    const chatId = msg.chat.id;
    if (chatId.toString() === adminId) {
        bot.sendMessage(chatId, "Please send me the file you want to upload.");
        bot.once('document', async (docMsg) => {
            const fileId = docMsg.document.file_id;
            // Store the fileId in MongoDB
            const file = new File({ fileId });
            await file.save();
            await bot.sendMessage(chatId, "File uploaded successfully!");
        });
    } else {
        bot.sendMessage(chatId, "You are not authorized to use this command.");
    }
});

// Handle /deletefile command for admin
bot.onText(/\/deletefile/, async (msg) => {
    const chatId = msg.chat.id;
    if (chatId.toString() === adminId) {
        const files = await File.find({});
        if (files.length === 0) {
            return bot.sendMessage(chatId, "No files available to delete.");
        }

        // List the files
        let fileList = "Available files:\n";
        files.forEach((file, index) => {
            fileList += `${index + 1}: ${file.fileId}\n`;
        });

        bot.sendMessage(chatId, fileList + "Please enter the number of the file you want to delete.");
        
        bot.once('message', async (msg) => {
            const fileIndex = parseInt(msg.text) - 1;
            if (fileIndex >= 0 && fileIndex < files.length) {
                await File.deleteOne({ _id: files[fileIndex]._id });
                bot.sendMessage(chatId, "File deleted successfully.");
            } else {
                bot.sendMessage(chatId, "Invalid file number. Please try again.");
            }
        });
    } else {
        bot.sendMessage(chatId, "You are not authorized to use this command.");
    }
});




// Handle /start command
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;

    // Check if the user already exists in the database
    const existingUser = await User.findOne({ userId: msg.from.id });

    if (!existingUser) {
        // Save user data into MongoDB if they do not exist
        const user = new User({
            userId: msg.from.id,
            chatId: msg.chat.id,
            firstName: msg.from.first_name,
            lastName: msg.from.last_name || '', // Handle cases where last name might not be provided
            username: msg.from.username || '', // Handle cases where username might not be provided
            joinedAt: new Date() // Store the current date
        });
        await user.save();
    } else {
        // Optionally, you can send a message to the user if they are already registered
        await bot.sendMessage(chatId, "Welcome back!");
    }

    // Send welcome message with photo and buttons
    await bot.sendPhoto(chatId,
        'https://w7.pngwing.com/pngs/332/615/png-transparent-phonepe-india-unified-payments-interface-india-purple-violet-text.png',
        {
            caption: '*Join Our Official Channel For More - https://t.me/apnidukaan7*',
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: 'Buy', callback_data: 'buy' }
                    ]
                ]
            }
        }
    );
});

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const data = query.data;

    switch (data) {
        case 'buy':
            try {
                // First send the tutorial video
                await bot.sendVideo(chatId, 'https://t.me/djmdumcsh/214', {
                    caption: '*Tutorial Video: How to Buy From Bot*',
                    parse_mode: 'Markdown'
                });
            
                // Then send QR code photo with payment instructions
                await bot.sendPhoto(chatId,
                    'https://t.me/djmdumcsh/216',
                    {
                        caption: '*Kindly Pay ₹60 And Submit UTR Number*',
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [[
                                { text: '❌ Cancel', callback_data: 'cancel' }
                            ]]
                        }
                    }
                );
            } catch (error) {
                console.error('Error in buy action:', error);
                await bot.sendMessage(chatId, 'Sorry, there was an error processing your request. Please try again.');
            }
            

            // Set up a listener for the next message
            bot.once('message', async (msg) => {
                if (msg.chat.id === chatId) {
                    if (/^\d+$/.test(msg.text)) {
                        // Delete user's message
                        await bot.deleteMessage(msg.chat.id, msg.message_id);
            
                        try {
                            // Check if the UTR has already been used
                            const existingPayment = await Payment.findOne({ utrNumber: msg.text });
            
                            if (existingPayment) {
                                await bot.sendMessage(chatId, '❌ This UTR number has already been used. Please use a valid UTR number.');
                                return;
                            }
            
                            // Make API request
                            const response = await fetch(`https://bharatqr.udayscriptsx.workers.dev/?token=${process.env.API_TOKEN}&id=${msg.text}`);
                            const data = await response.json();
            
                            // Log the entire response for debugging
                            console.log('API Response:', data);
            
                            // Check the response conditions
                            const currentDate = new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' });
                            const responseDate = new Date(data.date).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' });
            
                            if (data.status === 'SUCCESS' && data.amount === 60 && data.message === 'Transaction found') {
                                const files = await File.find({});
                                for (const file of files) {
                                    await bot.sendDocument(msg.chat.id, file.fileId, {}, { caption: 'Here is your file.' });
                                }
            
                                // Save UTR number to MongoDB to prevent reuse
                                const payment = new Payment({
                                    userId: msg.from.id,
                                    chatId: msg.chat.id,
                                    utrNumber: msg.text,
                                    paymentStatus: data
                                });
                                await payment.save();
                            } else {
                                // Edit the payment message with API response
                                await bot.editMessageCaption(
                                    `❌ _Invalid Payment_`,
                                    {
                                        chat_id: chatId,
                                        message_id: messageId,
                                        parse_mode: 'Markdown'
                                    }
                                );
                            }
                        } catch (error) {
                            console.error('Error checking payment status:', error);
                            await bot.sendMessage(chatId, 'Error checking payment status. Please try again.');
                        }
                    } else {
                        await bot.deleteMessage(msg.chat.id, msg.message_id);
                        await bot.sendMessage(chatId, 'Please send a valid numeric UTR number');
                    }
                }
            });
            
            break;

        case 'cancel':
            await bot.deleteMessage(chatId, messageId);
            await bot.sendMessage(chatId, 'Transaction cancelled');
            break;

        case 'like_photo':
            bot.sendMessage(chatId, '❤️ Thanks for liking the photo!');
            break;
    }

    // Answer the callback query
    bot.answerCallbackQuery(query.id);
});

// Error handling
bot.on('polling_error', (error) => {
    console.log('Polling error:', error);
});

console.log('Bot is running...');
