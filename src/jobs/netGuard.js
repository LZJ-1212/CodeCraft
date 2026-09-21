// 判断请求是不是来自这台电脑。
// 用户层面：网页接口只给本机用，同一 Wi-Fi 里的别人打不开你的工作室、也用不了你的密钥。
function isLoopbackAddress(addr) {
    const value = String(addr || '');
    return value === '127.0.0.1'
        || value === '::1'
        || value === '::ffff:127.0.0.1';
}

module.exports = { isLoopbackAddress };
