import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AlertProvider } from './components/Alert';
import { PyodideProvider } from './components/PyodideContext';
import LandingPage from './pages/LandingPage/LandingPage';
import GenerateTemplate from './pages/GenerateTemplate/GenerateTemplate';
import CheckCompliance from './pages/CheckCompliance/CheckCompliance';

const App = () => {
    return (
        <AlertProvider>
            <PyodideProvider>
                <BrowserRouter>
                    <Routes>
                        <Route path="/" element={<LandingPage />} />
                        <Route path="/generate-template" element={<GenerateTemplate />} />
                        <Route path="/check-compliance" element={<CheckCompliance />} />
                    </Routes>
                </BrowserRouter>
            </PyodideProvider>
        </AlertProvider>
    );
};

export default App;
