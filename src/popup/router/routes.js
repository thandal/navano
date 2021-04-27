import Welcome from "./pages/Welcome"
import Create from "./pages/Create"
import Import from "./pages/Import"

import Dashboard from "./pages/Dashboard"
import Send from "./pages/Send"
import Receive from "./pages/Receive"
import Transactions from "./pages/Transactions"
import Success from "./pages/Success"
import Failed from "./pages/Failed"
import Representative from "./pages/Representative"
import Sign from "./pages/Sign"

import Locked from "./pages/locked"
import Delete from "./pages/DeleteWallet"
import Backup from "./pages/Backup"
import ChangePassword from "./pages/ChangePassword"
import Connection from "./pages/Connection"

export default [
	// Setup pages
	{
		name: "welcome",
		path: "/welcome",
		alias: "/",
		component: Welcome
	},
	{
		name: "create",
		path: "/create",
		component: Create
	},
	{
		name: "import",
		path: "/import",
		component: Import
	},

	// Wallet pages
	{
		name: "dashboard",
		path: "/dashboard",
		component: Dashboard
	},
	{
		name: "send",
		path: "/send",
		component: Send
	},
	{
		name: "receive",
		path: "/receive",
		component: Receive
	},
	{
		name: "transactions",
		path: "/transactions",
		component: Transactions
	},
	{
		name: "success",
		path: "/success",
		component: Success
	},
	{
		name: "failed",
		path: "/failed",
		component: Failed
	},
	{
		name: "representative",
		path: "/representative",
		component: Representative
	},
	{
		name: "sign",
		path: "/sign",
		component: Sign
	},

	// Util
	{
		name: "locked",
		path: "/locked",
		component: Locked
	},
	{
		name: "delete",
		path: "/delete",
		component: Delete
	},
	{
		name: "backup",
		path: "/backup",
		component: Backup
	},
	{
		name: "changepassword",
		path: "/changepassword",
		component: ChangePassword
	},
	{
		name: "connection",
		path: "/connection",
		component: Connection
	}
]
