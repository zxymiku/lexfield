import React from 'react'
import ReactDOM from 'react-dom/client'
import '@lexfield/ui/styles.css'
import '@app/app.css'
import App from '@app/App'
import { setStorageFactory } from '@app/state/store'
import { TauriStorage } from './storage/tauri'

// desktop: progress lives in SQLite via tauri-plugin-sql
setStorageFactory(() => new TauriStorage())

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
