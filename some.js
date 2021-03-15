const jwt = require('jsonwebtoken');

let token = jwt.sign('secretisthesecret',process.env.ACCESS_TOKEN_SECRET);

let result;

console.log('The token is',token);

jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
	if(err) console.log(err);
	else 
		result = decoded;
});

console.log('The result is',result);
