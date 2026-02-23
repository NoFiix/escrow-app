import Header from "./Header";
import Footer from "./Footer";
import { ConnectButton } from "@rainbow-me/rainbowkit";

const Layout = ({ children }: Readonly<{
  children: React.ReactNode;
}>) => {
  return (
    <div className = "app">
        <Header />
        <main className ='main'>
            {children}
        </main>
        <Footer />
    </div>
  )
}

export default Layout