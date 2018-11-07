const gulp = require('gulp');
const fs       = require('fs');
const uglifyes = require('uglify-es');

gulp.task('mix', function (cb) {
    let files = fs.readdirSync('lib/');
    files.map(file => {
        const file_path = `lib/${file}`;
        const code      = fs.readFileSync(file_path).toString();
        const result    = uglifyes.minify(code).code;
        if(result !== undefined){
            fs.writeFileSync(file_path,result);
        }else{
            console.log(`uglify fail,file = ${file_path},please check file or code`);
        }
    })
});
