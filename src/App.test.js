import { render, screen } from '@testing-library/react';
import App from './App';
import { LanguageProvider } from './contexts/LanguageContext';

test('renders learn react link', () => {
  render(
    <LanguageProvider>
      <App />
    </LanguageProvider>
  );
  const linkElement = screen.getByText(/learn react/i);
  expect(linkElement).toBeInTheDocument();
});
