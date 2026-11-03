const { mk, cover, build, W, APP, FILE } = require('./lib.cjs');
const { P, H1, H2, bullets, steps, box, gap, table, pb } = mk(24);

const c = [
  ...cover({ title: 'Staff Guide', sub: 'How to sell, open tabs and record expenses', who: 'For bar and wholesale staff · Keep this at the till',
    lines: ['Your manager / owner:', 'Phone number:', 'Your login email:'] }),

  H1('Quick card: the 6 things you do every day'),
  table(['I want to…', 'Do this'], [
    ['**Start work**', 'Sign in. Check the bottom-left says **Shift Open**.'],
    ['**Sell something**', 'Tap the item → **Pay Now** → pick Cash / Mobile Money / Card → **Complete Transaction**.'],
    ['**Keep a customer\'s tab**', 'Add items → **Hold Bar Tab** → type the name → **Save & Open Tab**.'],
    ['**Pay a tab**', '**Open Bar Tabs** → **Close Out Tab** → **Pay Now**.'],
    ['**Record money going out**', '**Expenses** → amount → category → **Save expense**.'],
    ['**Finish work**', 'Hand over cash to the owner, then tap **Sign out**.'],
  ], [3200, 6706]),
  gap(),
  box('warn', 'Golden rules', [
    '1. Never share your password. Everything you sell is recorded under your name.',
    '2. Ring every sale. Never sell without entering it.',
    '3. Always **Sign out** when you leave the till.',
    '4. If something looks wrong, do not guess. Call the owner.',
  ]),

  pb(),
  H1('1. Starting your shift'),
  steps([
    'Open the app. You will see the sign-in screen.',
    'Under **Workspace**, choose the place you are working: **Bar** or **Wholesale**.',
    'Under **Sign in as**, choose **Staff**.',
    'Type your **email** and **password**, then tap **Sign in**.',
  ]),
  P('Look at the bottom-left of the screen. It shows your name and **Shift Open**. If it says **Shift Closed**, you cannot sell yet. Tell the owner to start the new shift.'),
  box('tip', 'Forgot your password?', ['If the app says **Wrong email or password**, check the spelling and that **Caps Lock** is off. If it still fails, tap **Forgot password?** or ask the owner to reset it for you.']),

  H1('2. Making a sale'),
  steps([
    '**Find the item.** Tap it on the screen. You can also type in **Search items**, tap a category (All, Beer, Cocktail, Spirits), or scan the barcode.',
    '**Choose the size** if the item has buttons: for example **+ Pint** or **+ Pitcher**, **+ Single** or **+ Double**.',
    'The item appears on the **Active Order Ticket** on the right. Add more items the same way.',
    '**Check the ticket.** Make sure the items and the **Total Due** are correct.',
    'Tap **Pay Now**.',
    'Choose how the customer pays: **Cash**, **Mobile Money** or **Card**.',
    'Tap **Complete Transaction**. The sale is saved and a receipt shows on the screen.',
  ]),
  gap(),
  table(['Situation', 'What to do'], [
    ['Customer wants to change something before paying', 'On the ticket use **−** to take one away, or the bin icon to remove the line.'],
    ['Item says **Out of Stock**', 'You cannot sell it. Tell the owner if you can see stock on the shelf.'],
    ['Customer wants a table or name on the ticket', 'Type it in **Customer / Table Name** (optional).'],
    ['Discount buttons (0% 10% 20%)', 'Use only if the owner allowed it. Leave on **0%** otherwise.'],
    ['Phone or tablet is slow', 'Wait for the receipt before starting the next sale.'],
  ], [3600, 6306]),

  H2('Wholesale: selling many at once'),
  P('On the Wholesale device you often sell crates or cases. Do not tap many times.'),
  steps([
    'Tap the item once so it is on the ticket.',
    'Tap the **number** between the **−** and **+** buttons. Type the quantity, for example **30**, and press **Enter**.',
    'The line total shows next to the price.',
  ]),
  box('note', 'Bulk price', ['Some items get a cheaper price when you buy enough. The ticket shows **Bulk price applied** when it happens, or tells you how many more to buy. The price changes by itself. Do not change it.',
    'You cannot enter more than what is in stock.']),

  H1('3. Customer tabs (Bar)'),
  P('A tab lets a customer drink now and pay later. Stock goes down when the tab is **paid**, not when it is opened.'),
  H2('Open a tab'),
  steps([
    'Add the items to the ticket.',
    'Tap **Hold Bar Tab**.',
    'Type the **customer or table name**, for example John or Table 12.',
    'Tap **Save & Open Tab**. The ticket clears and the tab is saved.',
  ]),
  H2('Add more later, then pay'),
  steps([
    'Tap **Open Bar Tabs** in the menu.',
    'Find the customer and tap **Close Out Tab**. The items move back onto the ticket.',
    'Add anything new, then tap **Pay Now** and finish the sale.',
  ]),
  box('warn', 'Do not forget open tabs', ['Before you finish work, check **Open Bar Tabs**. Tell the owner about every tab that is still open.']),

  H1('4. Recording expenses'),
  P('Use **Expenses** every time money leaves the business during your shift: ice, transport, gas, airtime, a casual worker, and so on.'),
  steps([
    'Tap **Expenses** in the menu.',
    'Type the **amount**.',
    'Tap the **category** (for example Ice & Gas, Transport).',
    'Choose **Paid from**:\n• **Cash from till** if you took it from the cash drawer.\n• **Mobile money** if paid from the business wallet.\n• **Owner / other** if the owner paid.',
    'Add who was paid and a short note if you can. "Other" needs a note.',
    'Tap **Save expense**.',
  ]),
  box('warn', 'Be honest about "Cash from till"', ['The owner counts the cash drawer at the end. If you took cash out and did not record it, the drawer will look **short** and it will be your shift that is questioned.']),
  box('note', 'Not for stock', ['Do not record deliveries of drinks as an expense. The owner records deliveries under **Stock Tracking**.']),
  P('Made a mistake? Tell the owner. Only the owner can cancel (void) an expense.'),

  H1('5. Looking up a sale'),
  P('Tap **Sales & Refunds** to see this shift\'s sales. You can search by receipt number, item or customer name.'),
  box('note', 'Refunds are done by the owner', ['If a customer wants money back, or you rang the wrong item, do **not** try to fix it yourself. Write down the receipt number, call the owner, and they will refund it. You will not see a Refund button. That is normal.']),

  H1('6. Stock and Calendar (view only)'),
  bullets([
    '**Stock Tracking** shows how much is left. Items running low are marked. Tell the owner early so they can order.',
    '**Calendar** shows sales for each day. You cannot see costs or profit.',
    'You cannot change stock, prices or products. Only the owner can.',
    'Do not change **Cloud Sync** settings. The owner or developer looks after it.',
  ]),

  H1('7. Finishing your shift'),
  steps([
    'Make sure every sale is entered and every expense is recorded.',
    'Check **Open Bar Tabs** and tell the owner about any that are open.',
    'Hand the cash drawer to the owner, or count it with them.',
    'Tap **Sign out** (bottom-left of the screen).',
  ]),
  P('You do **not** close the day. The owner does that.'),

  H1('8. Problems and what to do'),
  table(['Problem', 'What to do'], [
    ['I cannot sign in', 'Check the **Workspace** (Bar or Wholesale) and that **Staff** is selected. Check the email and password. Still failing? Ask the owner to reset your password.'],
    ['Screen says **Shift Closed**', 'You cannot sell. Ask the owner to start a new shift.'],
    ['No internet', 'Keep selling. The app saves on the device and sends the data when the internet comes back. Do not clear any data.'],
    ['Item missing from the screen', 'Check you are on **All** and the search box is empty. If it is still missing, tell the owner.'],
    ['Wrong item sold or wrong amount', 'Do not sell again to "fix" it. Call the owner and give the receipt number.'],
    ['Customer wants a printed receipt', 'Tap **Print** on the receipt. If nothing prints, tell the owner.'],
    ['The side menu looks cut off', 'Scroll the menu. **Sign out** is always at the bottom-left.'],
    ['Something strange happened', 'Do not tap **Clear saved data**. It erases the saved information on this device. Call the owner.'],
  ], [3300, 6606]),
  gap(),
  box('warn', 'Never tap "Clear saved data"', ['It is the small link at the very bottom of the menu. It deletes everything saved on this device that has not been sent to the cloud.']),
];

build(`${process.env.OUT_DIR || "."}/${FILE}_Staff_Guide.docx`, '{{APP}} Staff Guide', c.flat(Infinity)).then(() => console.log('staff done'));
