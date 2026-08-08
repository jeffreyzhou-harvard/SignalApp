import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter'
import './styles.css'
import App from './App'

// No StrictMode: the voice director is an imperative effect (speak → listen →
// advance) and dev double-invocation would double-drive the dialogue.
createRoot(document.getElementById('root')!).render(<App />)
