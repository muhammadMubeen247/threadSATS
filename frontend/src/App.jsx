import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Signup from './pages/Signup';
import VerifyOTP from './pages/VerifyOTP';
import Login from './pages/Login';
import Home from './pages/Home';
import ThreadDetail from './pages/ThreadDetail';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/signup" element={<Signup />} />
        <Route path="/verify-otp" element={<VerifyOTP />} />
        <Route path="/login" element={<Login />} />
        <Route path="/home" element={<Home />} />
        <Route path="/thread/:threadId" element={<ThreadDetail />} />
        <Route path="/" element={<Navigate to="/home" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;