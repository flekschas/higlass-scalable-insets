const path = require('path');

const autoprefixer = require('autoprefixer');
// const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;
const CopyWebpackPlugin = require('copy-webpack-plugin');
const HtmlWebPackPlugin = require('html-webpack-plugin');
const OptimizeCssAssetsPlugin = require('optimize-css-assets-webpack-plugin');
const UglifyJsPlugin = require('uglifyjs-webpack-plugin');
const UnminifiedWebpackPlugin = require('unminified-webpack-plugin');

module.exports = {
  output: {
    filename: 'higlass-scalable-insets.min.js',
    library: 'higlass-scalable-insets',
    libraryTarget: 'umd',
    path: path.resolve(__dirname, 'dist'),
  },
  devServer: {
    contentBase: [
      path.join(__dirname, 'node_modules/higlass/build'),
      path.join(__dirname, 'node_modules/higlass-image/dist'),
    ],
    watchContentBase: true,
  },
  optimization: {
    minimizer: [
      new UglifyJsPlugin({
        cache: true,
        parallel: true,
        sourceMap: false,
      }),
      new OptimizeCssAssetsPlugin({}),
    ],
    splitChunks: {
      cacheGroups: {
        styles: {
          name: 'index',
          test: /\.css$/,
          chunks: 'all',
          enforce: true,
        },
      },
    },
  },
  module: {
    rules: [
      // Run ESLint first
      {
        enforce: 'pre',
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'eslint-loader',
        },
      },
      // Transpile the ESD6 files to ES5
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
        },
      },
      // Convert SASS to CSS, postprocess it, and bundle it
      {
        test: /\.s?css$/,
        use: [
          'style-loader',
          {
            loader: 'css-loader',
            options: {
              importLoaders: 2,
              minimize: { safe: true },
              url: false,
              modules: true,
              localIdentName: '[name]__[local]__[hash:base64:6]',
            },
          },
          {
            loader: 'postcss-loader',
            options: {
              plugins: () => [
                require('postcss-flexbugs-fixes'),
                autoprefixer({
                  browsers: [
                    '>1%',
                    'last 4 versions',
                    'Firefox ESR',
                    'not ie < 9',
                  ],
                  flexbox: 'no-2009',
                }),
              ],
            },
          },
          'sass-loader',  // compiles Sass to CSS
        ],
      },
      // Extract them HTML files
      {
        test: /\.html$/,
        use: [
          {
            loader: 'html-loader',
            options: { minimize: true },
          },
        ],
      },
      {
        test: /.*\.(gif|png|jpe?g|svg)$/i,
        use: [
          {
            loader: 'file-loader',
            options: {
              name: 'images/[name].[ext]',
            },
          },
        ],
      },
    ],
  },
  plugins: [
    new HtmlWebPackPlugin({
      template: './src/index.html',
      filename: './index.html',
    }),
    new UnminifiedWebpackPlugin(),
    // new BundleAnalyzerPlugin(),
    new CopyWebpackPlugin([
      { from: './src/example-image.html', to: './example-image.html' },
    ]),
  ],
  externals: {
    'pixi.js': {
      commonjs: 'pixi.js',
      commonjs2: 'pixi.js',
      amd: 'pixi.js',
      root: 'PIXI',
    },
  },
};
