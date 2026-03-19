# Slither.io Server

![screenshot](asset/shot.png)


## Installation


1. Clone repo
```bash
git clone https://github.com/xbact/nodejsslitherioserver.git
```

2. Enter folder
```bash
cd nodejsslitherioserver
```
3. Install dependencies
```bash
npm install
```
4. Start server
```bash
npm start
```

## How To Connect

Open Slither.io → press F12 → go to **Console** tab → paste this:

```js
window.bso = { ip: "127.0.0.1", po: 8080 }; window.forcing = true;
```

## Contributing

Contributions are very welcome! Feel free to help fix the issues above or add new features.

## License

This project is licensed under the AGPL-3.0 License - see the [LICENSE](LICENSE) file for details.
