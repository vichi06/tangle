import { Routes, Route } from 'react-router-dom';
import HomePage from './components/HomePage';
import GroupView from './components/GroupView';
import './App.css';

function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/g/:code" element={<GroupView />} />
    </Routes>
  );
}

export default App;
