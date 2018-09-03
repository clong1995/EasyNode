const ejs = require('EasyNode/base');
const http = require('http');
const url = require('url');
const fs = require("fs");
const path = require("path");

//多网卡情况后期支持

/**
 * http服务，
 * 前端友好无干扰，前端不需要做任何配置和多余的工作
 * 需要依赖前端的EasyScript库的base.class.js
 *  特色：
 *  1、高性能，极轻量hppt服务
 *  2、动静分离
 *  3、修改后端代码免重启
 *  4、资源合并，降低请求量
 *  5、资源缓存，降低磁盘io
 *  6、首屏数据、首屏渲染，缩短相应时间，提升用户体验（有空再搞）
 *  7、自动前端模块化处理，降低前端非业务逻辑复杂度
 *  8、前端定向缓存减少请求
 * @param port 监听端口
 * @param dev 是否开启开发者开关，开启后代码修改免重启，生产环境一定为false或者不填写！！
 */
const cache = new Map();

module.exports = ({
                      port = 80,
                      dev = false,
                      cb = null
                  } = {}) => {

    //约定的目录结构
    let publicDir = ejs.getGlobal('root') + 'view/',
        apiDir = ejs.getGlobal('root') + 'api/';

    //启用http创建一个端口为HOST的服务
    http.createServer((req, res) => {
        let pathname = url.parse(req.url).pathname;
        if (pathname === '/') pathname += 'index';

        let arr = pathname.split('/');
        if (arr[1] === 'api') {//api的路由
            if (arr.length != 4) {
                output(res, 404);
            } else {
                let file = apiDir + arr[2] + '.js';
                //检测存在
                if (notExists(dev, file)) return output(res, 404, file);
                //相应请求
                let data = null;
                if (req.method.toUpperCase() === 'POST') { //POST
                    let postData = "";
                    //持续读写内容，因为post可能很大
                    req.on("data", data => postData += data);
                    req.on("end", () => {
                        try {
                            dev && delete require.cache[require.resolve(file)];
                            require(file)(arr[3], postData, data => output(res, 'json 200', data));
                        } catch (err) {
                            output(res, 500, err)
                        }
                    });
                } else {//GET
                    try {
                        dev && delete require.cache[require.resolve(file)];
                        require(file)(arr[3], url.parse(req.url, true).query, data => output(res, 'json 200', data));
                    } catch (err) {
                        output(res, 'json 200', err)
                    }
                }
            }
        } else {//页面的路由
            if (arr[1] === 'resource') {//静态资源
                let file = publicDir + ejs.trim(pathname, {char: '/', position: 'left'});
                //检测存在
                if (notExists(dev, file)) return output(res, 404, file);
                //资源类型
                let extname = ejs.trim(path.extname(file), {position: 'left', char: '.'});
                //检查是否有缓存
                if (!dev && cache.has(file)) {
                    output(res, extname + ' 200', cache.get(file), false);
                    return;
                }
                fs.readFile(file, (err, data) => {
                    if (err) {
                        output(res, 500, err);
                        return;
                    }
                    output(res, extname + ' 200', data, false);
                    cache.set(file, data);
                });
            } else {//页面资源
                let path = null;
                if (arr.length === 2) {//宿主主页
                    path = publicDir + arr[1] + '/';
                } else if (arr.length === 3) {//子模块
                    path = publicDir + arr[1] + '/part/' + arr[2] + '/';
                } else {
                    output(res, 404)
                    return;
                }

                //读取缓存
                if (!dev && cache.has(path)) {
                    output(res, 'html 200', cache.get(path), false);
                    return;
                }
                //并行拼装文件
                let step = 0;
                //内容对象
                let files = {'style.css': '', 'app.html': '', 'script.js': ''};
                for (let f in files) {
                    //异步读文件
                    let file = path + f;

                    //检测存在
                    if (notExists(dev, file)) return output(res, 404, file);
                    fs.readFile(file, 'utf8', (err, data) => {
                        if (err) {
                            output(res, 500, err);
                            return;
                        }
                        files[f] = data;
                        ++step;
                        if (step === 3) {
                            let content = arr.length === 3 ? make(files, path) : make(files);
                            output(res, 'html 200', content, false);
                            cache.set(path, content);
                        }
                    })
                }
            }
        }
    }).listen(port);

    //
    cb && cb(port);
};

function output(res, ContentType, data = null, json = true) {
    let type = 'text/css',
        code = 200;
    switch (ContentType) {
        case 'html 200':
            type = 'text/html';
            code = 200;
            break;
        case 'json 200':
            type = 'application/json';
            code = 200;
            break;
        case 'jpg 200':
            type = 'image/jpeg';
            code = 200;
            break;
        case 'text 200':
            type = 'text/plain';
            code = 200;
            break;
        case 'js 200':
            type = 'application/javascript';
            code = 200;
            break;
        case 'css 200':
            type = 'text/css';
            code = 200;
            break;
        case 404:
            code = 404;
            break;
        case 500:
            code = 500;
            break;
    }

    res.writeHead(code, {
        'Content-Type': type + ';charset=utf-8'
    });

    if (json) {
        res.end(JSON.stringify(data))
    } else {
        res.end(data);
    }
    return false;
}

function notExists(dev, path) {
    return dev ? !fs.existsSync(path) : false;
}

function make(files, part = false) {
    let content = '';
    let html = files['app.html'],
        style = files['style.css'],
        script = files['script.js'];
    if (part) {
        //TODO 扩展<entry>
    } else {
        //注入js和css
        content = html.replace('</head>', `<style>${style}</style><script>${script}</script>`);
    }
    return content;
}